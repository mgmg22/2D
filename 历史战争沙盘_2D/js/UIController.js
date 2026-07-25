/**
 * UIController - UI控制模块
 * 职责：时代选择、地图数据加载、势力信息面板
 */
const UIController = (function () {
  let battleData = null;
  let onEraSelectedCallback = null;

  // 时代数据缓存
  const eraCache = {};
  let eraList = [];

  // 加载状态锁：防止并发竞态
  let isLoading = false;
  let loadingEraId = null;

  /**
   * 初始化UI
   * 返回 manifest 加载完成的 Promise，便于 main.js 链式调用
   */
  function init() {
    // 时代选择按钮（事件委托）
    document.getElementById("era-list").addEventListener("click", (e) => {
      const btn = e.target.closest(".era-btn");
      if (!btn) return;
      if (!btn.dataset.era) return;
      selectEra(btn.dataset.era);
    });

    // 省份点击回调
    MapModule.onProvinceClick(handleProvinceClick);

    // 详情面板关闭按钮
    const closeBtn = document.getElementById("province-detail-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        document.getElementById("province-detail").classList.add("hidden");
        MapModule.clearSelection();
      });
    }

    return loadEraList();
  }

  /**
   * 处理省份点击：填充详情面板
   */
  function handleProvinceClick(province) {
    if (!battleData) return;

    const factions = battleData.factions || {};
    const provinceId = province.id || province.name;

    let cities = [];
    const provinces = battleData.provinces || [];
    const matchedProvince = provinces.find((p) => (p.id || p.name) === provinceId);
    if (matchedProvince && matchedProvince.cities) {
      cities = matchedProvince.cities;
    }
    if (battleData.cities) {
      const topLevelCities = battleData.cities.filter(
        (c) => c.province === provinceId
      );
      topLevelCities.forEach((c) => {
        if (!cities.find((ec) => ec.name === c.name)) {
          cities.push(c);
        }
      });
    }

    const factionId = province.faction;
    const factionInfo = factions[factionId];
    const factionName = (factionInfo && factionInfo.name) || factionId || "";
    const factionColor =
      (factionInfo && factionInfo.color) ||
      MapModule.factionColors[factionId] ||
      "#c9a96e";

    document.getElementById("province-detail-name").textContent =
      province.name || "";
    document.getElementById("province-detail-faction").innerHTML =
      factionName
        ? '<span style="color: ' + factionColor + '">' + factionName + "</span>"
        : "";
    document.getElementById("province-detail-source").textContent =
      province.source || "";

    const ul = document.getElementById("province-detail-cities");
    ul.innerHTML = "";
    cities.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = c.name + (c.capital ? " ★" : "");
      ul.appendChild(li);
    });

    document.getElementById("province-detail").classList.remove("hidden");
  }

  /**
   * 加载时代列表
   * 成功时渲染按钮并 resolve(eraList)；失败时显示重试按钮并 reject
   */
  async function loadEraList() {
    const container = document.getElementById("era-list");
    try {
      const resp = await fetch("data/eras/manifest.json?v=15&t=" + Date.now());
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const manifest = await resp.json();
      eraList = manifest.eras || [];

      container.innerHTML = "";
      eraList.forEach((era) => {
        const btn = document.createElement("button");
        btn.className = "era-btn";
        btn.dataset.era = era.id;
        btn.textContent = era.name;
        btn.title = era.description || "";
        container.appendChild(btn);
      });

      return eraList;
    } catch (err) {
      console.error("加载时代列表失败:", err);
      container.innerHTML = "";
      const retryBtn = document.createElement("button");
      retryBtn.className = "era-retry-btn";
      retryBtn.textContent = "加载失败，点击重试";
      retryBtn.addEventListener("click", () => {
        loadEraList()
          .then(() => {
            // 重试成功后自动选中首个时代（main.js 的 then 已无法再触发）
            const firstBtn = document.querySelector("#era-list .era-btn");
            if (firstBtn) selectEra(firstBtn.dataset.era);
          })
          .catch(() => {
            /* 错误态已由 loadEraList 自身渲染 */
          });
      });
      container.appendChild(retryBtn);
      throw err;
    }
  }

  /**
   * 选择时代
   * - 并发安全：加载中忽略新的请求；同名时代正在加载则直接返回
   * - 失败时不弹 alert，标记按钮错误态并保留上一个时代显示
   * - 成功后更新 battleData 并加载到地图
   */
  async function selectEra(eraId) {
    // 并发保护：同名时代正在加载，直接返回
    if (loadingEraId === eraId) return;
    // 已有其他时代正在加载，忽略（按钮已禁用，此处为编程调用兜底）
    if (isLoading) return;

    isLoading = true;
    loadingEraId = eraId;

    const targetBtn = document.querySelector(
      '.era-btn[data-era="' + eraId + '"]'
    );

    // 禁用所有时代按钮
    setButtonsDisabled(true);
    // 标记被点击按钮为加载态，清除其之前的错误态
    if (targetBtn) {
      targetBtn.classList.remove("era-btn--error");
      targetBtn.classList.add("era-btn--loading");
    }
    clearEraStatus();

    try {
      let mapData = eraCache[eraId];
      if (!mapData) {
        const [mapResp, roadsResp, riversResp] = await Promise.all([
          fetch("data/eras/" + eraId + "/map.json?v=15&t=" + Date.now()),
          fetch("data/eras/" + eraId + "/roads.json?v=15&t=" + Date.now()),
          fetch("data/eras/" + eraId + "/rivers.json?v=15&t=" + Date.now()),
        ]);
        if (!mapResp.ok) throw new Error("HTTP " + mapResp.status);
        mapData = await mapResp.json();
        if (roadsResp.ok) {
          const roadsData = await roadsResp.json();
          if (roadsData && roadsData.roads) {
            mapData.roads = roadsData.roads;
          }
        }
        if (riversResp.ok) {
          const riversData = await riversResp.json();
          if (riversData && riversData.rivers) {
            mapData.rivers = riversData.rivers;
          }
        }
        eraCache[eraId] = mapData;
      }

      // 成功：更新 battleData 与地图
      battleData = mapData;
      MapModule.loadCampaign(battleData, eraId);

      // 切换时代后关闭详情面板（避免显示上一时代省份信息）
      const detailEl = document.getElementById("province-detail");
      if (detailEl) detailEl.classList.add("hidden");

      // 通知剧情模块时代变更
      if (typeof ScenarioModule !== 'undefined') {
        ScenarioModule.onEraChanged(eraId, battleData);
      }

      // 更新按钮 active 态（仅成功时切换）
      document.querySelectorAll(".era-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.era === eraId);
      });

      // 更新底部信息
      document.getElementById("campaign-name").textContent =
        battleData.name || eraId;
      document.getElementById("era-description").textContent =
        battleData.description || "";
      updateTroopInfo(battleData.factions);

      // 通知回调
      if (onEraSelectedCallback) {
        onEraSelectedCallback(battleData, eraId);
      }
    } catch (err) {
      console.error("加载时代数据失败:", err);
      // 标记错误按钮，移除加载态
      if (targetBtn) {
        targetBtn.classList.remove("era-btn--loading");
        targetBtn.classList.add("era-btn--error");
      }
      // 底部显示错误文案，不清空 battleData（保留上一个时代显示）
      showEraStatus("该时代数据加载失败");
    } finally {
      // 恢复按钮可用
      setButtonsDisabled(false);
      if (targetBtn) targetBtn.classList.remove("era-btn--loading");
      isLoading = false;
      loadingEraId = null;
    }
  }

  /**
   * 禁用/启用所有时代按钮
   */
  function setButtonsDisabled(disabled) {
    document.querySelectorAll(".era-btn").forEach((btn) => {
      btn.disabled = disabled;
    });
  }

  /**
   * 显示底部状态文案（错误等）
   */
  function showEraStatus(msg) {
    const el = document.getElementById("era-status");
    if (el) el.textContent = msg;
  }

  /**
   * 清除底部状态文案
   */
  function clearEraStatus() {
    const el = document.getElementById("era-status");
    if (el) el.textContent = "";
  }

  /**
   * 更新势力信息面板
   */
  function updateTroopInfo(factions) {
    const list = document.getElementById("troop-list");
    list.innerHTML = "";

    if (!factions) return;

    Object.entries(factions).forEach(([factionId, info]) => {
      const color = info.color || MapModule.factionColors[factionId] || "#888";
      const item = document.createElement("div");
      item.className = "troop-item";
      item.innerHTML = `
        <span class="troop-name" style="color: ${color}">${info.name || factionId}</span>
      `;
      list.appendChild(item);
    });
  }

  /**
   * 设置时代选择回调
   */
  function onEraSelected(callback) {
    onEraSelectedCallback = callback;
  }

  /**
   * 获取当前时代数据
   */
  function getCurrentEra() {
    return battleData;
  }

  return {
    init,
    selectEra,
    onEraSelected,
    getCurrentEra,
  };
})();
