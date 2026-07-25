/**
 * MapModule - 2D地图模块
 * 职责：初始化Leaflet地图、渲染城市标记、渲染时代行政区划
 */
const MapModule = (function () {
  let map = null;
  let cityMarkers = {};
  let cityDotLayers = [];
  let cityLabelLayers = [];
  let factionUnionLayers = [];
  let provinceHitLayers = [];
  let provinceLabelLayers = [];
  let factionLabelLayers = [];
  let roadLayers = [];
  let riverLayers = [];

  const ROAD_STYLES = {
    0: {
      color: "#8B2500",
      weight: 3.5,
      opacity: 0.92,
      dashArray: null,
      zIndex: 500,
      minZoom: 4,
    },
    1: {
      color: "#A0522D",
      weight: 2.5,
      opacity: 0.85,
      dashArray: null,
      zIndex: 450,
      minZoom: 5,
    },
    2: {
      color: "#8B7355",
      weight: 1.8,
      opacity: 0.7,
      dashArray: null,
      zIndex: 400,
      minZoom: 6,
    },
    3: {
      color: "#8B7355",
      weight: 1.8,
      opacity: 0.7,
      dashArray: null,
      zIndex: 350,
      minZoom: 6,
    },
    4: {
      color: "#7A6B5A",
      weight: 1.1,
      opacity: 0.45,
      dashArray: "3,4",
      zIndex: 300,
      minZoom: 7,
    },
  };

  const LEVEL_STYLES = {
    0: {
      dotSize: 12,
      borderWidth: 2.5,
      fontSize: 13,
      fontWeight: "bold",
      bg: "rgba(20,20,40,0.95)",
      labelColor: "#FFD700",
      star: "★",
      padding: "2px 7px",
    },
    1: {
      dotSize: 9,
      borderWidth: 2,
      fontSize: 12,
      fontWeight: "bold",
      bg: "rgba(20,20,40,0.90)",
      labelColor: null,
      star: "",
      padding: "2px 6px",
    },
    2: {
      dotSize: 7,
      borderWidth: 1.5,
      fontSize: 11,
      fontWeight: "bold",
      bg: null,
      labelColor: null,
      star: "",
      padding: null,
    },
    3: {
      dotSize: 4,
      borderWidth: 1,
      fontSize: 9,
      fontWeight: "normal",
      bg: null,
      labelColor: null,
      star: "",
      padding: null,
    },
  };

  const ERA_LEVEL_NAMES = {
    spring_autumn_warring: ["王都/国都", "别都/重镇", "都邑", "城邑"],
    late_han: ["帝都", "州治", "郡治", "县城"],
    three_kingdoms: ["国都", "州治", "郡治", "县城"],
    eastern_jin: ["国都", "州治", "郡治", "县城"],
  };

  let currentEraId = null;

  let selectedProvinceLayer = null;
  let selectedProvince = null;
  let onProvinceClickCallback = null;

  let currentMapMode = "political";

  const factionColors = {
    Shu: "#2980b9",
    Wei: "#c0392b",
    Wu: "#27ae60",
    "sun-liu": "#2980b9",
    cao: "#c0392b",
    jin: "#27ae60",
    qin: "#B71C1C",
    yuan: "#8e44ad",
    wei_state: "#c0392b",
    shu: "#2E7D32",
    wu: "#EF6C00",
    wei: "#1565C0",
    chu: "#D32F2F",
    qi: "#FF8F00",
    yan: "#7B1FA2",
    zhao: "#00838F",
    han: "#5D4037",
    zhou: "#FFD700",
    lu: "#C62828",
    wei_small: "#1976D2",
    dongjin: "#E65100",
    qianqin: "#4A148C",
    qianyan: "#00695C",
    qianliang: "#283593",
    dai: "#3E2723",
    chouchi: "#827717",
    gongsun_yuan: "#880E4F",
    shu_sun: "#2E7D32",
    liu_biao: "#4E9A06",
    lv_bu: "#7B1FA2",
    yuan_shu: "#AD1457",
    liu_zhang: "#556B2F",
    zhang_lu: "#F57F17",
    ma_teng: "#6A1B9A",
    gongsun: "#00838F",
    zhang_xiu: "#37474F",
    barbarian: "#616161",
  };

  const BORDER_COLOR = "#8B7355";

  function init(containerId) {
    map = L.map(containerId, {
      center: [34.5, 108.0],
      zoom: 6,
      zoomControl: true,
      attributionControl: false,
    });

    map.on("zoomend", updateLabelOpacity);

    return map;
  }

  function loadCampaign(campaignData, eraId) {
    clearAll();
    currentEraId = eraId || null;
    const factions = campaignData.factions || {};
    const provinces = campaignData.provinces || [];

    const allCities = [];
    const provFaction = {};
    const citiesByProvince = {};
    provinces.forEach((p) => {
      const pid = p.id || p.name;
      provFaction[pid] = p.faction;
      if (p.cities) {
        p.cities.forEach((c) => {
          c.province = pid;
          c._color = getFactionColor(p.faction, factions);
          allCities.push(c);
          if (!citiesByProvince[pid]) citiesByProvince[pid] = [];
          citiesByProvince[pid].push(c);
        });
      }
    });
    if (campaignData.cities) {
      campaignData.cities.forEach((city) => {
        const fid = provFaction[city.province];
        city._color = getFactionColor(fid, factions);
        allCities.push(city);
        const pid = city.province;
        if (pid) {
          if (!citiesByProvince[pid]) citiesByProvince[pid] = [];
          citiesByProvince[pid].push(city);
        }
      });
    }

    allCities.forEach((city) => addCity(city));

    if (provinces.length) {
      const enrichedProvinces = provinces.map((p) => {
        const pid = p.id || p.name;
        if (!p.cities && citiesByProvince[pid]) {
          return Object.assign({}, p, { cities: citiesByProvince[pid] });
        }
        return p;
      });
      generateMinorRoads(enrichedProvinces, campaignData.rivers || []);
    }

    if (campaignData.rivers && campaignData.rivers.length) {
      renderRivers(campaignData.rivers);
    }

    if (provinces.length) {
      renderEraMap(provinces, factions);
    }

    fitBounds();
    updateLabelOpacity();
  }

  function addCity(city) {
    const level = typeof city.level === "number" ? city.level : (city.capital ? 2 : 3);
    const style = LEVEL_STYLES[level] || LEVEL_STYLES[3];
    const color = city._color || "#c9a96e";
    const name = city.name || "";
    const star = style.star;
    const displayName = star ? star + name : name;
    const labelColor = style.labelColor || color;

    const dot = L.marker(city.coord, {
      icon: L.divIcon({
        className: "label-plain",
        html: `<div style="width:${style.dotSize}px;height:${style.dotSize}px;background:${color};border:${style.borderWidth}px solid #1a1a2e;transform:translate(-50%,-50%) rotate(45deg);border-radius:1px;"></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      interactive: false,
    }).addTo(map);
    dot._tier = "city-dot";
    dot._level = level;
    cityDotLayers.push(dot);

    let labelHtml;
    if (style.bg) {
      labelHtml = `<div style="background:${style.bg};border:1px solid ${labelColor};color:${labelColor};padding:${style.padding};border-radius:2px;font-size:${style.fontSize}px;font-weight:${style.fontWeight};white-space:nowrap;transform:translate(${style.dotSize / 2 + 4}px,-100%);display:inline-block;text-shadow:none;">${displayName}</div>`;
    } else if (level <= 2) {
      labelHtml = `<div style="color:${labelColor};font-size:${style.fontSize}px;font-weight:${style.fontWeight};white-space:nowrap;text-shadow:0 0 3px rgba(0,0,0,0.95),0 0 2px rgba(0,0,0,0.8),0 1px 1px rgba(0,0,0,0.7);transform:translate(${style.dotSize / 2 + 3}px,-100%);display:inline-block;">${displayName}</div>`;
    } else {
      labelHtml = `<div style="color:${labelColor};font-size:${style.fontSize}px;font-weight:${style.fontWeight};white-space:nowrap;text-shadow:0 0 2px rgba(0,0,0,0.9),0 0 1px rgba(0,0,0,0.7);transform:translate(${style.dotSize / 2 + 2}px,-100%);display:inline-block;opacity:0.9;">${displayName}</div>`;
    }

    const marker = L.marker(city.coord, {
      icon: L.divIcon({
        className: "city-marker-plain",
        html: labelHtml,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
    }).addTo(map);

    marker._level = level;
    marker._city = city;
    cityLabelLayers.push(marker);

    if (city.description || level <= 1) {
      const eraTierNames = (currentEraId && ERA_LEVEL_NAMES[currentEraId]) || ERA_LEVEL_NAMES.three_kingdoms;
      const tierName = eraTierNames[level] || "城邑";
      const header =
        level === 0
          ? `<b>★ ${city.name}</b>（${tierName}）<br>`
          : level === 1
          ? `<b>${city.name}</b>（${tierName}）<br>`
          : `<b>${city.name}</b><br>`;
      const popupContent = city.description ? `${header}${city.description}` : header.replace(/<br>$/, "");
      marker.bindPopup(popupContent);
    }

    cityMarkers[city.name + "_" + (city.province || "")] = marker;
  }

  function getFactionColor(factionId, factions) {
    if (factions && factions[factionId] && factions[factionId].color) {
      return factions[factionId].color;
    }
    return factionColors[factionId] || "#888";
  }

  function hashRand(seed) {
    var a = (seed ^ 0xDEADBEEF) >>> 0;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getMaxDegree(cityLevel) {
    if (cityLevel === 0) return 6;
    if (cityLevel === 1) return 5;
    if (cityLevel === 2) return 4;
    return 4;
  }

  function getFactionPenalty(f1, f2) {
    if (!f1 || !f2) return 1.3;
    if (f1 === f2) return 1.0;
    var coreFactions = { wei: 1, shu: 1, wu: 1, Wei: 1, Shu: 1, Wu: 1 };
    var b1 = coreFactions[f1] === 1;
    var b2 = coreFactions[f2] === 1;
    if (f1 === "barbarian" || f2 === "barbarian") return 2.0;
    if (b1 && b2 && f1 !== f2) return 1.3;
    return 1.3;
  }

  function getTerrainFactor(sizeA, sizeB) {
    var s = Math.max(sizeA || 0.8, sizeB || 0.8);
    if (s >= 1.5) return 1.4;
    if (s >= 1.2) return 1.2;
    return 1.0;
  }

  function segmentsIntersect(p1, p2, p3, p4) {
    var d1 = (p2[1] - p1[1]) * (p3[0] - p2[0]) - (p2[0] - p1[0]) * (p3[1] - p2[1]);
    var d2 = (p2[1] - p1[1]) * (p4[0] - p2[0]) - (p2[0] - p1[0]) * (p4[1] - p2[1]);
    var d3 = (p4[1] - p3[1]) * (p1[0] - p4[0]) - (p4[0] - p3[0]) * (p1[1] - p4[1]);
    var d4 = (p4[1] - p3[1]) * (p2[0] - p4[0]) - (p4[0] - p3[0]) * (p2[1] - p4[1]);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      var eps = 0.001;
      var closeToEndpoint = function(a, b) {
        return Math.abs(a[0]-b[0]) < eps && Math.abs(a[1]-b[1]) < eps;
      };
      if (closeToEndpoint(p1,p3) || closeToEndpoint(p1,p4) ||
          closeToEndpoint(p2,p3) || closeToEndpoint(p2,p4)) return false;
      return true;
    }
    return false;
  }

  function isGabrielEdge(a, b, allCities) {
    var mx = (a.coord[1] + b.coord[1]) / 2;
    var my = (a.coord[0] + b.coord[0]) / 2;
    var dx = b.coord[1] - a.coord[1];
    var dy = b.coord[0] - a.coord[0];
    var r2 = (dx*dx + dy*dy) / 4;
    var margin = r2 * 0.85;
    var minLat = Math.min(a.coord[0], b.coord[0]) - 0.5;
    var maxLat = Math.max(a.coord[0], b.coord[0]) + 0.5;
    var minLon = Math.min(a.coord[1], b.coord[1]) - 0.5;
    var maxLon = Math.max(a.coord[1], b.coord[1]) + 0.5;
    for (var i = 0; i < allCities.length; i++) {
      var c = allCities[i];
      if (c.uid === a.uid || c.uid === b.uid) continue;
      if (c.coord[0] < minLat || c.coord[0] > maxLat || c.coord[1] < minLon || c.coord[1] > maxLon) continue;
      var ddx = c.coord[1] - mx;
      var ddy = c.coord[0] - my;
      var dist2 = ddx*ddx + ddy*ddy;
      if (dist2 < margin) return false;
    }
    return true;
  }

  function crossesRiver(aCoord, bCoord, rivers) {
    if (!rivers || !rivers.length) return false;
    var steps = 8;
    for (var ri = 0; ri < rivers.length; ri++) {
      var pts = rivers[ri].points;
      if (!pts || pts.length < 2) continue;
      var isMajor = (rivers[ri].width || 4) >= 4;
      if (!isMajor) continue;
      for (var si = 0; si < steps; si++) {
        var t = (si + 1) / (steps + 1);
        var plat = aCoord[0] + (bCoord[0] - aCoord[0]) * t;
        var plon = aCoord[1] + (bCoord[1] - aCoord[1]) * t;
        for (var seg = 0; seg < pts.length - 1; seg++) {
          var r1 = pts[seg], r2 = pts[seg+1];
          var cross = segmentsIntersect(aCoord, bCoord, r1, r2);
          if (cross) return { cross: true, nearLat: (r1[0]+r2[0])/2, nearLon: (r1[1]+r2[1])/2 };
          var mlat = (r1[0]+r2[0])/2, mlon = (r1[1]+r2[1])/2;
          var ddx = plon - mlon, ddy = plat - mlat;
          if (ddx*ddx + ddy*ddy < 0.0625) return { cross: true, nearLat: mlat, nearLon: mlon };
        }
      }
    }
    return { cross: false };
  }

  function distKm(a, b) {
    const lat1 = (a[0] * Math.PI) / 180;
    const lat2 = (b[0] * Math.PI) / 180;
    const dLat = ((b[0] - a[0]) * Math.PI) / 180;
    const dLon = ((b[1] - a[1]) * Math.PI) / 180;
    const R = 6371;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function pointToSegmentDistKm(p, a, b) {
    const lat1 = (a[0] * Math.PI) / 180;
    const lat2 = (b[0] * Math.PI) / 180;
    const latp = (p[0] * Math.PI) / 180;
    const dLonAB = ((b[1] - a[1]) * Math.PI) / 180;
    const R = 6371;
    const abLen = distKm(a, b);
    if (abLen < 0.1) return distKm(p, a);
    let t = 0;
    const dLonAP = ((p[1] - a[1]) * Math.PI) / 180;
    const y = Math.sin(dLonAP) * Math.cos(latp);
    const x = Math.cos(lat1) * Math.sin(latp) - Math.sin(lat1) * Math.cos(latp) * Math.cos(dLonAP);
    const bearingAP = Math.atan2(y, x);
    const y2 = Math.sin(dLonAB) * Math.cos(lat2);
    const x2 = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLonAB);
    const bearingAB = Math.atan2(y2, x2);
    const crossTrack = Math.asin(Math.sin(distKm(a, p) / R) * Math.sin(bearingAP - bearingAB)) * R;
    const alongTrack = Math.acos(Math.cos(distKm(a, p) / R) / Math.cos(crossTrack / R)) * R;
    if (alongTrack < 0) return distKm(p, a);
    if (alongTrack > abLen) return distKm(p, b);
    return Math.abs(crossTrack);
  }

  function snapMajorRoadsToCities(roads, allCities) {
    const cityMap = {};
    const suffixStrippedMap = {};

    function stripSuffix(name) {
      return name.replace(/(郡|国|县|州|道|城|邑|府|路|部|乡|亭|里)$/g, "").trim();
    }

    function addCityEntry(name, city) {
      if (!name) return;
      if (!cityMap[name]) cityMap[name] = city;
      const stripped = stripSuffix(name);
      if (stripped.length >= 1 && !suffixStrippedMap[stripped]) {
        suffixStrippedMap[stripped] = city;
      }
    }

    allCities.forEach((c) => {
      if (c.coord && c.name) {
        const cityObj = { coord: c.coord, level: typeof c.level === "number" ? c.level : 3, name: c.name };
        addCityEntry(c.name, cityObj);
      }
    });

    const aliasMap = {
      "长安": ["长安"], "洛阳": ["洛阳", "河南"], "邺": ["邺城", "邺县", "魏郡"], "成都": ["成都", "蜀郡"], "建业": ["建业", "丹阳", "秣陵"],
      "襄阳": ["襄阳", "南乡"], "宛": ["宛", "南阳"], "许昌": ["许昌", "颍阴", "颍川"], "南郑": ["南郑", "汉中"], "江陵": ["江陵", "南郡"],
      "蓟": ["蓟县", "涿郡", "涿县", "广阳", "燕国"], "邯郸": ["邯郸", "赵国"], "临淄": ["临淄", "齐郡", "齐国"], "彭城": ["彭城", "楚国", "徐州"], "寿春": ["寿春", "淮南"],
      "柴桑": ["柴桑", "寻阳"], "武昌": ["武昌", "鄂县"], "陈留": ["陈留", "陈留国"], "荥阳": ["荥阳"], "成皋": ["成皋", "成皋关", "虎牢"],
      "潼关": ["潼关", "华阴", "郑县"], "华阴": ["华阴"], "新安": ["新安"], "渑池": ["渑池", "弘农", "湖县"], "陕": ["陕县"],
      "扶风": ["扶风郡", "槐里", "右扶风", "始平"], "陈仓": ["陈仓", "陈仓县"], "天水": ["天水郡", "冀县"], "南安": ["南安郡", "豲道"], "陇西": ["陇西郡", "狄道"],
      "金城": ["金城郡", "允吾"], "武威": ["武威郡", "姑臧"], "张掖": ["张掖郡", "觻得"], "酒泉": ["酒泉郡", "禄福"], "敦煌": ["敦煌郡"],
      "孟津": ["孟津", "河阳", "平县"], "河内": ["河内郡", "怀县", "野王"], "朝歌": ["朝歌"], "真定": ["真定", "常山"], "襄平": ["襄平", "辽东"],
      "梁": ["梁国", "睢阳", "梁县", "鲁阳"], "新野": ["新野"], "蓝田": ["蓝田"], "武关": ["武关", "商县", "上洛"], "散关": ["散关", "故道"],
      "武都": ["武都", "武都郡", "下辨"], "斜谷": ["斜谷", "郿县"], "骆谷": ["骆谷", "周至"], "子午谷": ["子午谷"],
      "西城": ["西城", "魏兴", "安康"], "剑阁": ["剑阁", "剑门", "梓潼"],
      "梓潼": ["梓潼郡"], "涪": ["涪县", "涪城"], "绵竹": ["绵竹"], "巴中": ["巴中", "巴西", "阆中"], "阆中": ["阆中", "巴西"],
      "江州": ["江州", "巴郡", "巴", "重庆"], "武兴": ["武兴", "略阳"], "祁山": ["祁山"], "阴平": ["阴平", "阴平郡", "文县"],
      "江油": ["江油"], "江夏": ["江夏郡", "西陵", "沙羡"], "夏口": ["夏口", "沙羡", "沔口"], "巴丘": ["巴丘", "巴陵", "岳阳"],
      "长沙": ["长沙郡", "临湘"], "衡阳": ["衡阳", "湘南"], "零陵": ["零陵郡", "泉陵"], "始安": ["始安郡", "始安"],
      "临贺": ["临贺郡"], "苍梧": ["苍梧郡", "广信"], "番禺": ["番禺", "南海郡", "南海"],
      "豫章": ["豫章郡", "南昌"], "庐陵": ["庐陵郡"], "合浦": ["合浦郡", "布山"], "交趾": ["交趾郡", "龙编"],
      "九真": ["九真"], "日南": ["日南"], "上庸": ["上庸郡", "上庸", "房陵"], "房陵": ["房陵", "房县"],
      "广陵": ["广陵郡", "江都", "淮阴"], "僰道": ["僰道", "犍为", "宜宾"], "朱提": ["朱提郡"],
      "味县": ["味县", "建宁郡", "建宁", "曲靖"], "云南": ["云南郡", "云南县", "祥云"], "叶榆": ["叶榆", "云南"],
      "永昌": ["永昌郡", "不韦", "保山"], "临江": ["临江", "忠县"],
      "永安": ["永安", "白帝城", "鱼复", "奉节"], "夷陵": ["夷陵", "宜都", "宜昌"], "巫县": ["巫县", "巫山"],
      "濡须口": ["濡须口", "濡须坞", "巢县"], "皖": ["皖县", "庐江", "潜山"], "晋阳": ["晋阳", "太原郡", "太原"],
      "雁门": ["雁门郡", "广武"], "马邑": ["马邑", "雁门", "朔州"], "云中": ["云中郡", "云中", "托克托"], "盛乐": ["盛乐"],
      "上谷": ["上谷郡", "沮阳"], "代郡": ["代郡", "代县", "高柳"], "飞狐": ["飞狐口", "飞狐关"], "中山": ["中山国", "卢奴", "定州"],
      "居庸关": ["居庸关"], "楼兰": ["楼兰", "鄯善"], "焉耆": ["焉耆"], "龟兹": ["龟兹", "延城", "库车"], "疏勒": ["疏勒", "喀什"],
      "定陶": ["定陶", "济阴"], "任城": ["任城国", "任城"], "泰山": ["泰山郡", "奉高"], "东莱": ["东莱郡", "黄县"],
      "曲阿": ["曲阿", "云阳"], "吴": ["吴郡", "吴县", "苏州"], "会稽": ["会稽郡", "山阴", "绍兴"],
      "谯": ["谯郡", "谯县", "亳州"], "合肥": ["合肥"], "历阳": ["历阳", "历阳郡", "和县"], "郿": ["郿县", "眉县"],
      "东海": ["东海郡", "郯县"], "琅琊": ["琅琊郡", "开阳", "临沂"], "东莞": ["东莞郡"], "北海": ["北海国", "剧县", "平寿"],
      "平原": ["平原郡", "平原"], "乐安": ["乐安郡", "高苑"], "济南": ["济南国", "东平陵"], "乐陵": ["乐陵郡"],
      "清河": ["清河郡", "甘陵", "清河"], "巨鹿": ["巨鹿郡", "瘿陶", "廮陶"], "常山": ["常山郡", "元氏", "真定"],
      "安平": ["安平国", "信都"], "河间": ["河间国", "乐成"], "渤海": ["渤海郡", "南皮"],
      "涿": ["涿郡", "涿县", "蓟", "蓟县"],
      "邓县": ["邓县", "邓城"], "樊城": ["樊城", "襄阳"],
      "汝南": ["汝南郡", "平舆"], "陈郡": ["陈郡", "陈县"], "下邳": ["下邳国", "下邳"],
      "陇右": ["陇西", "狄道"], "河西": ["武威", "姑臧"], "关中": ["长安"],
      "江东": ["建业", "吴郡"], "三吴": ["吴郡", "会稽", "吴县"],
    };

    function findCity(name) {
      if (!name) return null;
      const cleanName = name.replace(/[（(].*?[)）]/g, "").trim();
      if (cityMap[cleanName]) return cityMap[cleanName];
      const stripped = stripSuffix(cleanName);
      if (suffixStrippedMap[stripped] && stripped.length >= 1) return suffixStrippedMap[stripped];
      if (suffixStrippedMap[cleanName]) return suffixStrippedMap[cleanName];
      const aliases = aliasMap[cleanName];
      if (aliases) {
        for (const a of aliases) {
          if (cityMap[a]) return cityMap[a];
          const sa = stripSuffix(a);
          if (suffixStrippedMap[sa]) return suffixStrippedMap[sa];
        }
      }
      for (const key in suffixStrippedMap) {
        if (key.length >= 2 && cleanName.length >= 2) {
          if (key === cleanName || key === stripped) return suffixStrippedMap[key];
          if (key.length >= 2 && cleanName.startsWith(key)) return suffixStrippedMap[key];
          if (key.length >= 2 && key.startsWith(cleanName)) return suffixStrippedMap[key];
        }
      }
      return null;
    }

    function parseRouteCities(desc) {
      if (!desc) return [];
      const cleaned = desc.replace(/[（(].*?[)）]/g, "");
      const segments = cleaned.split(/[;；。\n]/);
      const found = [];
      const seen = new Set();
      segments.forEach((seg) => {
        const parts = seg.split(/[→→\-–—到至]/);
        parts.forEach((p) => {
          const name = p.trim();
          if (name && name.length >= 1 && name.length <= 6) {
            const city = findCity(name);
            if (city && !seen.has(name)) {
              seen.add(name);
              found.push(city);
            }
          }
        });
      });
      return found;
    }

    function pointToSegmentDistSq(p, a, b) {
      const dLat = b[0] - a[0];
      const dLon = b[1] - a[1];
      const lenSq = dLat * dLat + dLon * dLon;
      if (lenSq < 1e-12) {
        return { d: (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2, t: 0 };
      }
      let t = ((p[0] - a[0]) * dLat + (p[1] - a[1]) * dLon) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const projLat = a[0] + t * dLat;
      const projLon = a[1] + t * dLon;
      return { d: (p[0] - projLat) ** 2 + (p[1] - projLon) ** 2, t, proj: [projLat, projLon] };
    }

    function snapCitiesToPath(points, citiesToSnap, forced, existingFlags) {
      let result = points.slice();
      const forcedFlags = existingFlags ? existingFlags.slice() : new Array(result.length).fill(false);
      if (!existingFlags) {
        forcedFlags[0] = true;
        forcedFlags[result.length - 1] = true;
      }
      const insertions = [];

      citiesToSnap.forEach((city) => {
        let minD = Infinity;
        let bestSeg = 0;
        let bestT = 0;
        for (let i = 0; i < result.length - 1; i++) {
          const res = pointToSegmentDistSq(city.coord, result[i], result[i + 1]);
          const degToKm = 111;
          const dKm = Math.sqrt(res.d) * degToKm;
          if (dKm < minD) {
            minD = dKm;
            bestSeg = i;
            bestT = res.t;
          }
        }
        const thresh = forced ? Infinity : (city.level === 0 ? 30 : city.level === 1 ? 20 : 0);
        if (minD < thresh) {
          insertions.push({ coord: city.coord, seg: bestSeg, t: bestT, d: minD, level: city.level, forced: forced });
        }
      });

      insertions.sort((a, b) => {
        if (a.seg !== b.seg) return b.seg - a.seg;
        return b.t - a.t;
      });
      insertions.forEach(({ coord, seg, forced: insForced }) => {
        result.splice(seg + 1, 0, coord);
        forcedFlags.splice(seg + 1, 0, insForced);
      });
      return { points: result, forcedFlags };
    }

    function smoothPath(points, forcedFlags, anchorCoords) {
      if (points.length < 3) return points;
      const smoothed = points.map(p => [p[0], p[1]]);
      for (let i = 1; i < points.length - 1; i++) {
        if (forcedFlags && forcedFlags[i]) continue;
        let isAnchor = false;
        if (anchorCoords) {
          for (const ac of anchorCoords) {
            if (Math.abs(points[i][0] - ac[0]) < 0.01 && Math.abs(points[i][1] - ac[1]) < 0.01) {
              isAnchor = true;
              break;
            }
          }
        }
        if (isAnchor) continue;
        const prev = points[i - 1];
        const next = points[i + 1];
        const midLat = (prev[0] + next[0]) / 2;
        const midLon = (prev[1] + next[1]) / 2;
        smoothed[i][0] = points[i][0] + 0.25 * (midLat - points[i][0]);
        smoothed[i][1] = points[i][1] + 0.25 * (midLon - points[i][1]);
      }
      return smoothed;
    }

    return roads.map((road) => {
      const level = typeof road.level === "number" ? road.level : 2;
      let points = (road.points || []).slice();

      if (level <= 2) {
        let snapRes = { points, forcedFlags: null };
        const routeCities = parseRouteCities(road.description);
        const anchorCoords = routeCities.map(c => c.coord);
        if (routeCities.length >= 2) {
          snapRes = snapCitiesToPath(points, routeCities, true);
          points = snapRes.points;
        }
        const nearbyCapitals = allCities.filter((c) => {
          if (!c.coord) return false;
          const cl = typeof c.level === "number" ? c.level : 3;
          return cl <= 1;
        });
        snapRes = snapCitiesToPath(points, nearbyCapitals.map(c => ({ coord: c.coord, level: c.level })), false, snapRes.forcedFlags);
        points = snapRes.points;
        points = smoothPath(points, snapRes.forcedFlags, anchorCoords);
      }

      return Object.assign({}, road, { points });
    });
  }

  function catmullRomSmooth(points, alpha, iterations) {
    if (!points || points.length < 3) return points;
    alpha = alpha || 0.3;
    iterations = iterations || 2;
    var result = points.map(function(p) { return [p[0], p[1]]; });
    for (var iter = 0; iter < iterations; iter++) {
      var input = result;
      result = [input[0]];
      for (var i = 0; i < input.length - 1; i++) {
        var p0 = input[Math.max(0, i - 1)];
        var p1 = input[i];
        var p2 = input[i + 1];
        var p3 = input[Math.min(input.length - 1, i + 2)];
        for (var t = 1; t <= 3; t++) {
          var tt = t / 4;
          var t2 = tt * tt;
          var t3 = t2 * tt;
          var lat = 0.5 * ((2 * p1[0]) +
            (-p0[0] + p2[0]) * tt +
            (2*p0[0] - 5*p1[0] + 4*p2[0] - p3[0]) * t2 +
            (-p0[0] + 3*p1[0] - 3*p2[0] + p3[0]) * t3);
          var lon = 0.5 * ((2 * p1[1]) +
            (-p0[1] + p2[1]) * tt +
            (2*p0[1] - 5*p1[1] + 4*p2[1] - p3[1]) * t2 +
            (-p0[1] + 3*p1[1] - 3*p2[1] + p3[1]) * t3);
          result.push([lat, lon]);
        }
      }
      result.push(input[input.length - 1]);
    }
    return result;
  }

  function generateMinorRoads(provinces, rivers) {
    var t0 = performance.now();
    rivers = rivers || [];
    var allCitiesList = [];
    var cityUid = 0;
    var provSizeMap = {};

    provinces.forEach(function(p) {
      if (!p.cities) return;
      var pid = p.id || p.name;
      var psize = typeof p.size === "number" ? p.size : 1.0;
      provSizeMap[pid] = psize;
      var provFaction = p.faction || null;
      p.cities.forEach(function(c) {
        if (!c.coord) return;
        var lvl = typeof c.level === "number" ? c.level : (c.capital ? 2 : 3);
        var city = {
          uid: cityUid++,
          name: c.name,
          coord: c.coord,
          province: pid,
          faction: c._color ? provFaction : provFaction,
          level: lvl,
          capital: !!c.capital,
          provSize: psize,
          deg: 0,
        };
        allCitiesList.push(city);
      });
    });

    var n = allCitiesList.length;
    if (n < 2) return;

    var points = new Array(n);
    for (var i = 0; i < n; i++) {
      points[i] = [allCitiesList[i].coord[1], allCitiesList[i].coord[0]];
    }

    var delaunay;
    try {
      delaunay = d3.Delaunay.from(points);
    } catch(e) {
      console.warn("Delaunay failed, falling back to simple connections", e);
      return;
    }

    var edgeSet = {};
    var candidates = [];
    var tri = delaunay.triangles;
    for (var t = 0; t < tri.length; t += 3) {
      var i1 = tri[t], i2 = tri[t+1], i3 = tri[t+2];
      var pairs = [[i1,i2],[i2,i3],[i3,i1]];
      for (var pi = 0; pi < 3; pi++) {
        var a = pairs[pi][0], b = pairs[pi][1];
        if (a > b) { var tmp = a; a = b; b = tmp; }
        var key = a + "_" + b;
        if (!edgeSet[key]) {
          edgeSet[key] = true;
          var ca = allCitiesList[a], cb = allCitiesList[b];
          var d = distKm(ca.coord, cb.coord);
          var fp = getFactionPenalty(ca.faction, cb.faction);
          var tf = getTerrainFactor(ca.provSize, cb.provSize);
          var w = d * fp * tf;
          if (d <= 200) {
            candidates.push({ a: a, b: b, dist: d, weight: w });
          }
        }
      }
    }

    candidates.sort(function(e1, e2) { return e1.weight - e2.weight; });

    var parent = new Array(n);
    var rank = new Array(n);
    for (var i = 0; i < n; i++) { parent[i] = i; rank[i] = 0; }
    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    function unite(x, y) {
      var rx = find(x), ry = find(y);
      if (rx === ry) return false;
      if (rank[rx] < rank[ry]) { parent[rx] = ry; }
      else { parent[ry] = rx; if (rank[rx] === rank[ry]) rank[rx]++; }
      return true;
    }

    var mstEdges = [];
    var degrees = new Array(n);
    for (var i = 0; i < n; i++) degrees[i] = 0;

    for (var ci = 0; ci < candidates.length; ci++) {
      var e = candidates[ci];
      if (find(e.a) !== find(e.b)) {
        unite(e.a, e.b);
        mstEdges.push(e);
        degrees[e.a]++;
        degrees[e.b]++;
        e.inMst = true;
      }
    }

    var coreCities = allCitiesList.filter(function(c) { return c.faction !== "barbarian"; });
    var coreComponents = new Set();
    coreCities.forEach(function(c) { coreComponents.add(find(c.uid)); });
    if (coreComponents.size > 1) {
      for (var ci = 0; ci < candidates.length; ci++) {
        var e = candidates[ci];
        if (e.inMst) continue;
        var ca = allCitiesList[e.a], cb = allCitiesList[e.b];
        if (ca.faction === "barbarian" && cb.faction === "barbarian") continue;
        if (find(e.a) !== find(e.b)) {
          unite(e.a, e.b);
          mstEdges.push(e);
          degrees[e.a]++;
          degrees[e.b]++;
          e.inMst = true;
          coreComponents = new Set();
          coreCities.forEach(function(c) { coreComponents.add(find(c.uid)); });
          if (coreComponents.size <= 1) break;
        }
      }
    }

    var gabrielEdges = [];
    var targetExtra = Math.floor(mstEdges.length * 0.5);
    for (var ci = 0; ci < candidates.length && gabrielEdges.length < targetExtra; ci++) {
      var e = candidates[ci];
      if (e.inMst) continue;
      var ca = allCitiesList[e.a], cb = allCitiesList[e.b];
      var maxA = getMaxDegree(ca.level);
      var maxB = getMaxDegree(cb.level);
      if (degrees[e.a] >= maxA || degrees[e.b] >= maxB) continue;
      if (e.dist > 150 && (ca.faction === "barbarian" && cb.faction === "barbarian")) continue;
      if (!isGabrielEdge(ca, cb, allCitiesList)) continue;
      gabrielEdges.push(e);
      degrees[e.a]++;
      degrees[e.b]++;
      e.inGabriel = true;
    }

    var finalEdges = mstEdges.concat(gabrielEdges);

    var overCap = [];
    for (var i = 0; i < n; i++) {
      var ml = getMaxDegree(allCitiesList[i].level);
      if (degrees[i] > ml) overCap.push(i);
    }
    overCap.forEach(function(overNode) {
      var nodeEdges = [];
      finalEdges.forEach(function(fe) {
        if (fe.a === overNode || fe.b === overNode) nodeEdges.push(fe);
      });
      nodeEdges.sort(function(a, b) {
        if (a.inGabriel && !b.inGabriel) return -1;
        if (!a.inGabriel && b.inGabriel) return 1;
        return b.weight - a.weight;
      });
      var maxL = getMaxDegree(allCitiesList[overNode].level);
      while (degrees[overNode] > maxL && nodeEdges.length > 1) {
        var rem = nodeEdges.shift();
        rem.removed = true;
        degrees[overNode]--;
        var otherN = rem.a === overNode ? rem.b : rem.a;
        degrees[otherN]--;
      }
    });
    finalEdges = finalEdges.filter(function(e) { return !e.removed; });

    var parent2 = new Array(n);
    var rank2 = new Array(n);
    for (var i = 0; i < n; i++) { parent2[i] = i; rank2[i] = 0; }
    function find2(x) { while (parent2[x] !== x) { parent2[x] = parent2[parent2[x]]; x = parent2[x]; } return x; }
    function unite2(x, y) {
      var rx = find2(x), ry = find2(y);
      if (rx === ry) return false;
      if (rank2[rx] < rank2[ry]) { parent2[rx] = ry; } else { parent2[ry] = rx; if (rank2[rx]===rank2[ry]) rank2[rx]++; }
      return true;
    }
    finalEdges.forEach(function(e) { unite2(e.a, e.b); });
    for (var ci = 0; ci < candidates.length; ci++) {
      var e = candidates[ci];
      if (e.inMst || e.inGabriel || e.removed) continue;
      if (find2(e.a) !== find2(e.b)) {
        var caR = allCitiesList[e.a], cbR = allCitiesList[e.b];
        var maxAR = getMaxDegree(caR.level), maxBR = getMaxDegree(cbR.level);
        if (degrees[e.a] < maxAR && degrees[e.b] < maxBR) {
          unite2(e.a, e.b);
          finalEdges.push(e);
          degrees[e.a]++; degrees[e.b]++;
        }
      }
    }

    var minorRoads = [];
    var edgeSeed = 0;
    finalEdges.forEach(function(e) {
      var ca = allCitiesList[e.a], cb = allCitiesList[e.b];
      
      var isTrunk = e.inMst;
      var lv = isTrunk ? 3 : 4;

      var lat1 = ca.coord[0], lon1 = ca.coord[1];
      var lat2 = cb.coord[0], lon2 = cb.coord[1];
      var pts;

      var rng = hashRand(ca.uid * 7919 + cb.uid * 6151 + 17);
      var tf = getTerrainFactor(ca.provSize, cb.provSize);

      if (e.dist < 25) {
        pts = [[lat1, lon1], [lat2, lon2]];
      } else if (e.dist < 80) {
        var angle = rng() * Math.PI * 2;
        var off = (0.03 + 0.03 * (tf - 1.0)) * (0.5 + rng() * 0.5);
        var ml = (lat1+lat2)/2 + Math.sin(angle) * off;
        var mn = (lon1+lon2)/2 + Math.cos(angle) * off * 0.8;
        var rv = crossesRiver(ca.coord, cb.coord, rivers);
        if (rv.cross && rv.nearLat) {
          ml = ml * 0.5 + rv.nearLat * 0.5;
          mn = mn * 0.5 + rv.nearLon * 0.5;
        }
        pts = [[lat1, lon1], [ml, mn], [lat2, lon2]];
      } else {
        var a1 = rng() * Math.PI * 2;
        var a2 = rng() * Math.PI * 2;
        var off1 = (0.04 + 0.04 * (tf - 1.0)) * (0.4 + rng() * 0.6);
        var off2 = (0.04 + 0.04 * (tf - 1.0)) * (0.4 + rng() * 0.6);
        var m1l = lat1 + (lat2-lat1)/3 + Math.sin(a1) * off1;
        var m1n = lon1 + (lon2-lon1)/3 + Math.cos(a1) * off1 * 0.8;
        var m2l = lat1 + 2*(lat2-lat1)/3 + Math.sin(a2) * off2;
        var m2n = lon1 + 2*(lon2-lon1)/3 + Math.cos(a2) * off2 * 0.8;
        var rv = crossesRiver(ca.coord, cb.coord, rivers);
        if (rv.cross && rv.nearLat) {
          m1l = m1l * 0.6 + rv.nearLat * 0.4;
          m1n = m1n * 0.6 + rv.nearLon * 0.4;
        }
        pts = [[lat1, lon1], [m1l, m1n], [m2l, m2n], [lat2, lon2]];
      }

      if (pts.length >= 3) {
        pts = catmullRomSmooth(pts, 0.3, 1);
      }

      minorRoads.push({
        id: "minor_" + edgeSeed++,
        name: lv <= 3 ? "县道" : "乡道",
        level: lv,
        points: pts,
      });
    });

    if (minorRoads.length) renderRoads(minorRoads);

    var t1 = performance.now();
    var stats = {
      nodes: n,
      mstEdges: mstEdges.length,
      gabrielEdges: gabrielEdges.length,
      totalEdges: minorRoads.length,
      execTimeMs: Math.round(t1 - t0),
      avgDegree: parseFloat((2 * finalEdges.length / n).toFixed(2)),
      maxDegree: Math.max.apply(null, degrees),
    };
    var crossFaction = 0;
    finalEdges.forEach(function(e) {
      var ca = allCitiesList[e.a], cb = allCitiesList[e.b];
      if (ca.faction && cb.faction && ca.faction !== cb.faction &&
          ca.faction !== "barbarian" && cb.faction !== "barbarian") crossFaction++;
    });
    stats.crossFactionEdges = crossFaction;
    stats.crossFactionRatio = parseFloat((crossFaction / Math.max(1,finalEdges.length)).toFixed(3));
    var visited = new Array(n); for (var i=0;i<n;i++) visited[i]=false;
    var queue = [0]; visited[0] = true;
    while (queue.length) {
      var u = queue.shift();
      finalEdges.forEach(function(e) {
        var v = -1;
        if (e.a === u) v = e.b;
        else if (e.b === u) v = e.a;
        if (v >= 0 && !visited[v]) { visited[v] = true; queue.push(v); }
      });
    }
    var comps = 0;
    for (var i = 0; i < n; i++) { if (!visited[i]) comps++; }
    stats.connectedComponents = comps + 1;
    var degDist = {};
    for (var i = 0; i < n; i++) {
      var d = degrees[i];
      degDist[d] = (degDist[d] || 0) + 1;
    }
    stats.degreeDistribution = degDist;
    window.__roadStats = stats;
    console.log("[RoadGen]", stats.nodes, "cities,", stats.mstEdges, "MST +", stats.gabrielEdges, "Gabriel =", stats.totalEdges, "roads,", stats.avgDegree, "avg deg,", stats.execTimeMs, "ms");
  }

  function renderRoads(roads) {
    roads.forEach((road) => {
      const level = typeof road.level === "number" ? road.level : 2;
      const style = ROAD_STYLES[level] || ROAD_STYLES[2];
      if (!road.points || road.points.length < 2) return;

      const latlngs = road.points.map(([lat, lon]) => [lat, lon]);

      const shadow = L.polyline(latlngs, {
        color: "#000",
        weight: style.weight + 1.0,
        opacity: 0.15,
        dashArray: style.dashArray || null,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(map);
      shadow._roadLevel = level;
      shadow._isRoadShadow = true;
      roadLayers.push(shadow);

      const line = L.polyline(latlngs, {
        color: style.color,
        weight: style.weight,
        opacity: style.opacity,
        dashArray: style.dashArray || null,
        lineCap: "round",
        lineJoin: "round",
        interactive: level <= 3,
      }).addTo(map);
      line._roadLevel = level;
      line._road = road;
      roadLayers.push(line);

      if (level <= 3) {
        const levelNames = ["驰道/直道", "官道", "驿道", "县/郡际道"];
        const tierName = levelNames[level] || "道路";
        const popupContent = `<b>${road.name}</b>（${tierName}）${road.source ? "<br><small>出典：" + road.source + "</small>" : ""}${road.description ? "<br><small>" + road.description + "</small>" : ""}`;
        line.bindTooltip(popupContent, {
          sticky: true,
          direction: "top",
          className: "road-tooltip",
        });
      }
    });
  }

  function renderRivers(rivers) {
    rivers.forEach((river) => {
      if (!river.points || river.points.length < 2) return;
      const latlngs = river.points.map(([lat, lon]) => [lat, lon]);
      const width = river.width || 4;
      const color = river.color || "#4A8BC2";
      const isMajor = width >= 4;

      const shore = L.polyline(latlngs, {
        color: "#2a4a5a",
        weight: width + 3,
        opacity: 0.3,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(map);
      shore._river = river;
      riverLayers.push(shore);

      const line = L.polyline(latlngs, {
        color: color,
        weight: width,
        opacity: isMajor ? 0.85 : 0.7,
        lineCap: "round",
        lineJoin: "round",
        interactive: true,
      }).addTo(map);
      line._river = river;
      riverLayers.push(line);

      line.bindTooltip(`<b>${river.name}</b>`, {
        sticky: true,
        direction: "top",
        className: "river-tooltip",
      });
    });
  }

  function renderEraMap(provinces, factions) {
    renderFactionUnions(provinces, factions);
    renderProvinceHitLayer(provinces, factions);
    renderProvinceLabels(provinces, factions);
    renderFactionLabels(provinces, factions);
  }

  function renderFactionUnions(provinces, factions) {
    provinces.forEach((p) => {
      if (!p.boundary || !p.boundary.length) return;

      const hasFaction = !!p.faction;
      const color = hasFaction ? getFactionColor(p.faction, factions) : BORDER_COLOR;
      const fillOpacity = hasFaction ? 0.5 : 0.08;
      const weight = hasFaction ? 1.0 : 0.5;
      const opacity = hasFaction ? 0.7 : 0.3;

      const layer = L.polygon(p.boundary, {
        fillColor: color,
        fillOpacity: fillOpacity,
        color: color,
        weight: weight,
        opacity: opacity,
        interactive: false,
      }).addTo(map);

      layer._province = p;
      factionUnionLayers.push(layer);
    });
  }

  function renderProvinceHitLayer(provinces, factions) {
    provinces.forEach((p) => {
      if (!p.faction) return;
      if (!p.boundary || !p.boundary.length) return;

      const color = getFactionColor(p.faction, factions);
      const layer = L.polygon(p.boundary, {
        fillColor: color,
        fillOpacity: 0,
        color: color,
        weight: 0,
        opacity: 0,
        interactive: true,
      }).addTo(map);

      const factionName = (factions[p.faction] && factions[p.faction].name) || p.faction;
      layer.bindTooltip(
        `${p.name}（${factionName}）<br><small>${p.source || ""}</small>`,
        {
          sticky: true,
          direction: "top",
          className: "territory-tooltip",
        }
      );

      layer.on("mouseover", function () {
        this.setStyle({ fillOpacity: 0.25, weight: 1.5, opacity: 0.9 });
      });
      layer.on("mouseout", function () {
        if (this === selectedProvinceLayer) {
          this.setStyle({ fillOpacity: 0.5, weight: 3, opacity: 1 });
        } else {
          this.setStyle({ fillOpacity: 0, weight: 0, opacity: 0 });
        }
      });
      layer.on("click", function () {
        if (selectedProvinceLayer && selectedProvinceLayer !== this) {
          selectedProvinceLayer.setStyle({ fillOpacity: 0, weight: 0, opacity: 0 });
        }
        this.setStyle({ fillOpacity: 0.5, weight: 3, opacity: 1, color: color });
        selectedProvinceLayer = this;
        selectedProvince = p;
        if (onProvinceClickCallback) {
          onProvinceClickCallback(p);
        }
      });

      layer._province = p;
      provinceHitLayers.push(layer);
    });
  }

  function calculateCentroid(points) {
    if (!points || !points.length) return null;
    let latSum = 0;
    let lonSum = 0;
    points.forEach(([lat, lon]) => {
      latSum += lat;
      lonSum += lon;
    });
    return [latSum / points.length, lonSum / points.length];
  }

  function renderProvinceLabels(provinces, factions) {
    provinces.forEach((p) => {
      if (!p.boundary || !p.boundary.length) return;

      const centroid = calculateCentroid(p.boundary);
      if (!centroid) return;

      const nameText = p.name || "";
      const marker = L.marker(centroid, {
        icon: L.divIcon({
          className: "label-plain",
          html: `<div style="font-family:'Songti SC',serif;font-size:11px;color:#3a2a1a;font-weight:600;text-shadow:0 0 2px rgba(232,220,200,0.9),0 0 3px rgba(232,220,200,0.7),0 1px 1px rgba(255,255,255,0.5);white-space:nowrap;transform:translate(-50%,-50%);display:inline-block;">${nameText}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        interactive: false,
      }).addTo(map);

      marker._tier = "province";
      provinceLabelLayers.push(marker);
    });
  }

  function renderFactionLabels(provinces, factions) {
    const groups = {};
    provinces.forEach((p) => {
      const f = p.faction;
      if (!f) return;
      if (!p.boundary || !p.boundary.length) return;
      if (!groups[f]) groups[f] = [];
      groups[f].push(...p.boundary);
    });

    Object.keys(groups).forEach((faction) => {
      if (faction === "barbarian") return;
      const centroid = calculateCentroid(groups[faction]);
      if (!centroid) return;

      const label = (factions[faction] && factions[faction].name) || faction;
      const marker = L.marker(centroid, {
        icon: L.divIcon({
          className: "label-plain",
          html: `<div style="font-family:'Songti SC',serif;font-size:18px;font-weight:bold;color:#1a0f05;text-shadow:1px 1px 2px rgba(232,220,200,0.95),-1px -1px 2px rgba(232,220,200,0.95),0 0 5px rgba(255,255,255,0.8);white-space:nowrap;letter-spacing:3px;transform:translate(-50%,-50%);display:inline-block;">${label}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        interactive: false,
      }).addTo(map);

      marker._tier = "faction";
      factionLabelLayers.push(marker);
    });
  }

  function updateLabelOpacity() {
    if (!map) return;
    const zoom = map.getZoom();

    let maxVisibleLevel;
    let factionOpacity, provinceOpacity;

    if (zoom >= 8) {
      maxVisibleLevel = 3;
      factionOpacity = 0.7;
      provinceOpacity = 0.5;
    } else if (zoom >= 7) {
      maxVisibleLevel = 3;
      factionOpacity = 0.9;
      provinceOpacity = 0.75;
    } else if (zoom >= 6) {
      maxVisibleLevel = 2;
      factionOpacity = 1.0;
      provinceOpacity = 0.8;
    } else if (zoom >= 5) {
      maxVisibleLevel = 1;
      factionOpacity = 1.0;
      provinceOpacity = 0;
    } else {
      maxVisibleLevel = 0;
      factionOpacity = 1.0;
      provinceOpacity = 0;
    }

    const setOpacity = (layers, opacity, filterFn) => {
      layers.forEach((marker) => {
        if (filterFn && !filterFn(marker)) return;
        const el = marker.getElement && marker.getElement();
        if (el) el.style.opacity = opacity;
      });
    };

    setOpacity(factionLabelLayers, factionOpacity);
    setOpacity(provinceLabelLayers, provinceOpacity);

    cityDotLayers.forEach((dot) => {
      const el = dot.getElement && dot.getElement();
      if (!el) return;
      const lv = dot._level != null ? dot._level : 3;
      el.style.opacity = lv <= maxVisibleLevel ? "1" : "0";
    });

    cityLabelLayers.forEach((marker) => {
      const el = marker.getElement && marker.getElement();
      if (!el) return;
      const lv = marker._level != null ? marker._level : 3;
      const visible = lv <= maxVisibleLevel;
      el.style.opacity = visible ? "1" : "0";
      el.style.pointerEvents = visible ? "auto" : "none";
    });

    roadLayers.forEach((layer) => {
      const lv = layer._roadLevel != null ? layer._roadLevel : 2;
      const style = ROAD_STYLES[lv] || ROAD_STYLES[2];
      const minZoom = style.minZoom != null ? style.minZoom : (lv === 0 ? 4 : lv === 1 ? 5 : lv === 2 ? 6 : lv === 3 ? 7 : 8);
      const roadVisible = zoom >= minZoom;
      const targetOpacity = roadVisible ? (layer._isRoadShadow ? 0.15 : style.opacity) : 0;
      if (layer.setStyle) {
        layer.setStyle({ opacity: targetOpacity });
        if (!roadVisible && layer.closeTooltip) {
          layer.closeTooltip();
        }
      } else {
        const el = layer.getElement && layer.getElement();
        if (el) el.style.opacity = roadVisible ? "1" : "0";
      }
    });

    if (zoom >= 6) {
      resolveLabelCollisions(maxVisibleLevel);
    }
  }

  function resolveLabelCollisions(maxVisibleLevel) {
    const visibleMarkers = [];
    cityLabelLayers.forEach((marker) => {
      const el = marker.getElement && marker.getElement();
      if (!el) return;
      const opacity = parseFloat(el.style.opacity) || 0;
      if (opacity > 0) {
        visibleMarkers.push({ marker, el, level: marker._level != null ? marker._level : 3 });
      }
    });

    visibleMarkers.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return 0;
    });

    const placedRects = [];

    visibleMarkers.forEach(({ marker, el, level }) => {
      const latlng = marker.getLatLng();
      const point = map.latLngToContainerPoint(latlng);
      const estWidth = level === 0 ? 80 : level === 1 ? 65 : level === 2 ? 50 : 38;
      const estHeight = level === 0 ? 22 : level === 1 ? 20 : 18;
      const width = el.offsetWidth || estWidth;
      const height = el.offsetHeight || estHeight;

      const rect = {
        left: point.x - 2,
        top: point.y - height,
        right: point.x + width + 4,
        bottom: point.y + 2,
      };

      let overlaps = false;
      for (const placed of placedRects) {
        if (
          rect.left < placed.right &&
          rect.right > placed.left &&
          rect.top < placed.bottom &&
          rect.bottom > placed.top
        ) {
          overlaps = true;
          break;
        }
      }

      if (overlaps && level >= 2) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
      } else {
        placedRects.push(rect);
      }
    });
  }

  function fitBounds() {
    const cityPoints = [];

    Object.values(cityMarkers).forEach((m) => {
      const ll = m.getLatLng();
      if (ll.lat >= 18 && ll.lat <= 45 && ll.lng >= 95 && ll.lng <= 128) {
        cityPoints.push([ll.lat, ll.lng]);
      }
    });

    roadLayers.forEach((l) => {
      if (l._road && l.getLatLngs) {
        l.getLatLngs().forEach((pt) => {
          if (pt.lat >= 20 && pt.lat <= 45 && pt.lng >= 95 && pt.lng <= 128) {
            cityPoints.push([pt.lat, pt.lng]);
          }
        });
      }
    });

    if (cityPoints.length >= 2) {
      const bounds = L.latLngBounds(cityPoints);
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const centerLat = (sw.lat + ne.lat) / 2;
      const centerLng = (sw.lng + ne.lng) / 2;
      const latSpan = ne.lat - sw.lat;
      const lngSpan = ne.lng - sw.lng;
      const targetLatPad = Math.max(latSpan * 0.12, 1.5);
      const targetLonPad = Math.max(lngSpan * 0.08, 1.5);
      const finalBounds = L.latLngBounds(
        [Math.max(18, sw.lat - targetLatPad), Math.max(95, sw.lng - targetLonPad)],
        [Math.min(46, ne.lat + targetLatPad), Math.min(129, ne.lng + targetLonPad)]
      );
      map.fitBounds(finalBounds, { padding: [30, 30], maxZoom: 6, animate: false });
      if (map.getZoom() < 6) {
        map.setView([34.0, 112.0], 6, { animate: false });
      }
      return;
    }

    map.setView([34.0, 112.0], 6, { animate: false });
  }

  function onProvinceClick(cb) {
    onProvinceClickCallback = cb;
  }

  function clearSelection() {
    if (selectedProvinceLayer) {
      selectedProvinceLayer.setStyle({ fillOpacity: 0, weight: 0, opacity: 0 });
      selectedProvinceLayer = null;
      selectedProvince = null;
    }
  }

  function setMapMode(mode) {
    currentMapMode = "political";
  }

  function clearAll() {
    if (map) {
      factionUnionLayers.forEach((l) => map.removeLayer(l));
      provinceHitLayers.forEach((l) => map.removeLayer(l));
      provinceLabelLayers.forEach((l) => map.removeLayer(l));
      factionLabelLayers.forEach((l) => map.removeLayer(l));
      cityDotLayers.forEach((l) => map.removeLayer(l));
      cityLabelLayers.forEach((l) => map.removeLayer(l));
      roadLayers.forEach((l) => map.removeLayer(l));
      riverLayers.forEach((l) => map.removeLayer(l));
    }

    factionUnionLayers = [];
    provinceHitLayers = [];
    provinceLabelLayers = [];
    factionLabelLayers = [];
    cityDotLayers = [];
    cityLabelLayers = [];
    roadLayers = [];
    riverLayers = [];
    cityMarkers = {};

    clearSelection();
    currentMapMode = "political";
  }

  function setView(center, zoom) {
    if (map) {
      map.setView(center, zoom);
    }
  }

  function getMap() {
    return map;
  }

  function getProvinceLayers() {
    return { factionUnionLayers, provinceHitLayers };
  }

  function getFactionUnionLayers() {
    return factionUnionLayers;
  }

  function setProvinceFaction(provinceId, factionId, color) {
    let newColor = color;
    if (!newColor) {
      if (factionId === 'jin') {
        newColor = '#5D3FD3';
      } else {
        newColor = factionColors[factionId] || '#888';
      }
    }
    const allLayers = factionUnionLayers.concat(provinceHitLayers);
    allLayers.forEach(function(layer) {
      if (layer._province) {
        const pid = layer._province.id || layer._province.name;
        if (pid === provinceId) {
          layer.setStyle({ fillColor: newColor, color: newColor });
        }
      }
    });
  }

  return {
    init,
    loadCampaign,
    addCity,
    fitBounds,
    setView,
    clearAll,
    getMap,
    factionColors,
    onProvinceClick,
    clearSelection,
    setMapMode,
    getProvinceLayers,
    getFactionUnionLayers,
    setProvinceFaction,
  };
})();
