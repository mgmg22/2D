/**
 * ScenarioModule - 剧情时间轴模块
 * 职责：历史剧情时间轴渲染、事件选择、路线绘制、领土变化
 */
const ScenarioModule = (function () {
  let map = null;
  let scenarioData = null;
  let currentEventIndex = -1;
  let routeLayers = [];
  let eventMarker = null;
  let timelinePanel = null;
  let detailPanel = null;
  let autoPlayTimer = null;
  let currentFactionOverrides = {};
  let originalColors = {}; // 保存郡的原始颜色，用于重置

  const eventTypeColors = {
    military: '#C0392B',
    political: '#2E86C1',
    battle: '#E67E22',
    internal: '#27AE60',
    succession: '#8E44AD',
    death: '#7F8C8D'
  };

  const eventTypeNames = {
    military: '军事',
    political: '政治',
    battle: '战役',
    internal: '内政',
    succession: '禅代/灭亡',
    death: '薨逝'
  };

  const factionColorMap = {
    wei: '#3D5A80',
    shu: '#2E8B2E',
    wu: '#1A6BB5',
    jin: '#5D3FD3'
  };

  function init(mapInstance) {
    map = mapInstance;
    timelinePanel = document.getElementById('scenario-timeline');
    detailPanel = document.getElementById('event-detail');
    bindEvents();
  }

  function bindEvents() {
    const prevBtn = document.getElementById('btn-prev-event');
    const playBtn = document.getElementById('btn-play-event');
    const nextBtn = document.getElementById('btn-next-event');
    const closeBtn = document.getElementById('btn-close-event');
    const detailCloseBtn = document.getElementById('event-detail-close');

    if (prevBtn) prevBtn.addEventListener('click', prevEvent);
    if (playBtn) playBtn.addEventListener('click', toggleAutoPlay);
    if (nextBtn) nextBtn.addEventListener('click', nextEvent);
    if (closeBtn) closeBtn.addEventListener('click', closeEvent);
    if (detailCloseBtn) detailCloseBtn.addEventListener('click', closeEvent);
  }

  async function onEraChanged(eraId, mapData) {
    clearAll();
    if (eraId === 'jin_unification') {
      currentFactionOverrides = {};
      await loadScenarioData(eraId);
      if (scenarioData) {
        // 延迟保存原始颜色，确保地图渲染完成
        setTimeout(function() { saveOriginalColors(); }, 500);
        renderTimeline(scenarioData);
        showTimeline();
      }
    } else {
      hideTimeline();
    }
  }

  async function loadScenarioData(eraId) {
    try {
      const resp = await fetch('data/eras/' + eraId + '/scenario.json?v=27&t=' + Date.now());
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      scenarioData = await resp.json();
    } catch (err) {
      console.error('加载剧情数据失败:', err);
      scenarioData = null;
    }
  }

  function renderTimeline(scenario) {
    if (!timelinePanel) return;
    const phasesContainer = document.getElementById('timeline-phases');
    if (!phasesContainer) return;
    phasesContainer.innerHTML = '';

    const phaseMap = {};
    (scenario.phases || []).forEach(function(p) {
      phaseMap[p.id] = p;
    });

    const eventsByPhase = {};
    (scenario.events || []).forEach(function(evt, idx) {
      const pid = evt.phase || 'default';
      if (!eventsByPhase[pid]) eventsByPhase[pid] = [];
      eventsByPhase[pid].push({ event: evt, index: idx });
    });

    (scenario.phases || []).forEach(function(phase) {
      const phaseEvents = eventsByPhase[phase.id] || [];
      if (phaseEvents.length === 0) return;

      const phaseHeader = document.createElement('div');
      phaseHeader.className = 'phase-header';
      phaseHeader.style.setProperty('--phase-color', phase.color);
      phaseHeader.textContent = phase.name + ' (' + phase.startYear + '-' + phase.endYear + ')';
      phasesContainer.appendChild(phaseHeader);

      phaseEvents.forEach(function(item) {
        const evt = item.event;
        const idx = item.index;
        const typeColor = eventTypeColors[evt.type] || '#888';

        const eventItem = document.createElement('div');
        eventItem.className = 'event-item';
        eventItem.dataset.index = idx;

        const dot = document.createElement('div');
        dot.className = 'event-dot';
        dot.style.background = typeColor;

        const content = document.createElement('div');
        content.className = 'event-content';

        const title = document.createElement('div');
        title.className = 'event-item-title';
        title.textContent = evt.title;

        const date = document.createElement('div');
        date.className = 'event-item-date';
        date.textContent = evt.eraDate || '';

        content.appendChild(title);
        content.appendChild(date);
        eventItem.appendChild(dot);
        eventItem.appendChild(content);

        eventItem.addEventListener('click', function() {
          const clickedIdx = parseInt(this.dataset.index, 10);
          if (clickedIdx === currentEventIndex) {
            closeEvent();
          } else {
            selectEvent(clickedIdx);
          }
        });

        phasesContainer.appendChild(eventItem);
      });
    });
  }

  function selectEvent(index) {
    if (!scenarioData || !scenarioData.events || !scenarioData.events[index]) return;

    clearRoutes();
    if (eventMarker) {
      map.removeLayer(eventMarker);
      eventMarker = null;
    }

    currentEventIndex = index;
    const event = scenarioData.events[index];

    // 重放从0到当前事件的所有变色，确保状态正确
    replayTerritoryChanges(index);

    map.flyTo(event.coord, event.zoom || 7, { duration: 1.0 });
    updateTimelineHighlight();

    setTimeout(function() {
      eventMarker = L.circleMarker(event.coord, {
        radius: 8,
        color: '#FFD700',
        weight: 3,
        fillColor: '#FF4500',
        fillOpacity: 0.8
      }).addTo(map);
      eventMarker.bindTooltip(event.title, { permanent: false }).openTooltip();

      if (event.routes && event.routes.length > 0) {
        drawRoutes(event.routes);
      }

      showEventDetail(event);
    }, 1000);
  }

  // 保存所有郡的原始颜色
  function saveOriginalColors() {
    originalColors = {};
    if (typeof MapModule !== 'undefined' && MapModule.getFactionUnionLayers) {
      var layers = MapModule.getFactionUnionLayers();
      layers.forEach(function(layer) {
        if (layer._province && layer._province.id) {
          originalColors[layer._province.id] = {
            fillColor: layer.options.fillColor,
            color: layer.options.color
          };
        }
      });
    }
  }

  // 恢复所有郡到原始颜色
  function restoreOriginalColors() {
    if (typeof MapModule !== 'undefined' && MapModule.getFactionUnionLayers) {
      var layers = MapModule.getFactionUnionLayers();
      layers.forEach(function(layer) {
        if (layer._province && layer._province.id && originalColors[layer._province.id]) {
          var orig = originalColors[layer._province.id];
          layer.setStyle({ fillColor: orig.fillColor, color: orig.color });
        }
      });
    }
    if (typeof MapModule !== 'undefined' && MapModule.getProvinceLayers) {
      var info = MapModule.getProvinceLayers();
      if (info && info.provinceHitLayers) {
        info.provinceHitLayers.forEach(function(layer) {
          if (layer._province && layer._province.id && originalColors[layer._province.id]) {
            var orig = originalColors[layer._province.id];
            layer.setStyle({ fillColor: orig.fillColor, color: orig.color });
          }
        });
      }
    }
    currentFactionOverrides = {};
  }

  // 重放从0到targetIndex的所有变色
  function replayTerritoryChanges(targetIndex) {
    restoreOriginalColors();
    for (var i = 0; i <= targetIndex; i++) {
      var e = scenarioData.events[i];
      if (e && e.territoryChange) {
        applyTerritoryChange(e.territoryChange);
      }
    }
  }

  function drawRoutes(routes) {
    clearRoutes();
    routes.forEach(function(route) {
      const polyline = L.polyline(route.path, {
        color: route.color,
        weight: 3,
        opacity: 0.85,
        dashArray: '8,6',
        lineCap: 'round'
      }).addTo(map);

      const midIdx = Math.floor(route.path.length / 2);
      const midPoint = route.path[midIdx];
      const arrow = L.marker(midPoint, {
        icon: L.divIcon({
          className: 'route-arrow',
          html: '<div style="color:' + route.color + ';font-size:18px;font-weight:bold;text-shadow:0 0 3px #000;transform:rotate(0deg);">▶</div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        }),
        interactive: false
      }).addTo(map);

      const endPoint = route.path[route.path.length - 1];
      const label = L.marker(endPoint, {
        icon: L.divIcon({
          className: 'route-label',
          html: '<div style="background:' + route.color + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:11px;white-space:nowrap;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.5);">' + route.commander + '</div>',
          iconSize: [80, 20],
          iconAnchor: [40, -5]
        }),
        interactive: false
      }).addTo(map);

      routeLayers.push(polyline, arrow, label);
    });
  }

  function clearRoutes() {
    routeLayers.forEach(function(l) {
      if (map && map.removeLayer) {
        map.removeLayer(l);
      }
    });
    routeLayers = [];
  }

  function applyTerritoryChange(change) {
    const provinces = change.provinces || [];
    let color = null;
    if (change.to === 'jin') {
      color = '#5D3FD3';
    } else if (change.to === 'wei') {
      color = '#3D5A80';
    } else if (change.to === 'shu') {
      color = '#2E8B2E';
    } else if (change.to === 'wu') {
      color = '#1A6BB5';
    }

    provinces.forEach(function(pid) {
      currentFactionOverrides[pid] = { faction: change.to, color: color };
      if (typeof MapModule !== 'undefined' && MapModule.setProvinceFaction) {
        MapModule.setProvinceFaction(pid, change.to, color);
      }
    });
  }

  function showEventDetail(event) {
    if (!detailPanel) return;

    const titleEl = document.getElementById('event-title');
    const dateEl = document.getElementById('event-date');
    const typeEl = document.getElementById('event-type');
    const descEl = document.getElementById('event-desc');
    const forcesEl = document.getElementById('event-forces');
    const figuresEl = document.getElementById('event-figures');
    const sourcesEl = document.getElementById('event-sources');

    if (titleEl) titleEl.textContent = event.title || '';
    if (dateEl) dateEl.textContent = event.eraDate || '';

    if (typeEl) {
      const typeName = eventTypeNames[event.type] || event.type;
      const typeColor = eventTypeColors[event.type] || '#888';
      typeEl.textContent = typeName;
      typeEl.style.background = typeColor;
    }

    if (descEl) descEl.textContent = event.description || '';

    if (forcesEl) {
      forcesEl.innerHTML = '';
      if (event.forces && event.forces.length > 0) {
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'event-section-title';
        sectionTitle.textContent = '兵力部署';
        forcesEl.appendChild(sectionTitle);
        event.forces.forEach(function(f) {
          const item = document.createElement('div');
          item.className = 'force-item';
          const fColor = factionColorMap[f.faction] || '#888';
          item.innerHTML = '<span style="color:' + fColor + ';font-weight:bold;">' + f.commander + '</span>' +
            '<span class="force-count">' + f.count + '</span>' +
            '<span class="force-role">' + f.role + '</span>';
          forcesEl.appendChild(item);
        });
      }
    }

    if (figuresEl) {
      figuresEl.innerHTML = '';
      if (event.figures && event.figures.length > 0) {
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'event-section-title';
        sectionTitle.textContent = '相关人物';
        figuresEl.appendChild(sectionTitle);
        event.figures.forEach(function(f) {
          const tag = document.createElement('span');
          tag.className = 'figure-tag';
          const fColor = factionColorMap[f.faction] || '#8B7355';
          tag.style.borderColor = fColor;
          tag.innerHTML = '<strong>' + f.role + ':</strong>' + f.name;
          figuresEl.appendChild(tag);
        });
      }
    }

    if (sourcesEl) {
      sourcesEl.innerHTML = '';
      if (event.sources && event.sources.length > 0) {
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'event-section-title';
        sectionTitle.textContent = '史料来源';
        sourcesEl.appendChild(sectionTitle);
        event.sources.forEach(function(s) {
          const quote = document.createElement('div');
          quote.className = 'source-quote';
          const book = document.createElement('div');
          book.className = 'source-book';
          book.textContent = '《' + s.book + '》';
          const text = document.createElement('div');
          text.className = 'source-text';
          text.textContent = s.quote;
          quote.appendChild(book);
          quote.appendChild(text);
          sourcesEl.appendChild(quote);
        });
      }
    }

    detailPanel.classList.remove('hidden');
    detailPanel.classList.add('visible');
  }

  function updateTimelineHighlight() {
    if (!timelinePanel) return;
    const items = timelinePanel.querySelectorAll('.event-item');
    items.forEach(function(item, idx) {
      const itemIdx = parseInt(item.dataset.index, 10);
      if (itemIdx === currentEventIndex) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  function closeEvent() {
    currentEventIndex = -1;
    clearRoutes();
    if (eventMarker) {
      map.removeLayer(eventMarker);
      eventMarker = null;
    }
    if (detailPanel) {
      detailPanel.classList.remove('visible');
      setTimeout(function() {
        if (detailPanel) detailPanel.classList.add('hidden');
      }, 300);
    }
    updateTimelineHighlight();
  }

  function nextEvent() {
    if (!scenarioData || !scenarioData.events) return;
    if (currentEventIndex < scenarioData.events.length - 1) {
      selectEvent(currentEventIndex + 1);
    } else {
      if (autoPlayTimer) {
        clearInterval(autoPlayTimer);
        autoPlayTimer = null;
        updatePlayButton(false);
      }
    }
  }

  function prevEvent() {
    if (currentEventIndex > 0) {
      selectEvent(currentEventIndex - 1);
    }
  }

  function toggleAutoPlay() {
    const playBtn = document.getElementById('btn-play-event');
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
      updatePlayButton(false);
    } else {
      if (currentEventIndex < 0 && scenarioData && scenarioData.events && scenarioData.events.length > 0) {
        selectEvent(0);
      }
      autoPlayTimer = setInterval(function() {
        if (scenarioData && scenarioData.events && currentEventIndex < scenarioData.events.length - 1) {
          nextEvent();
        } else {
          if (autoPlayTimer) {
            clearInterval(autoPlayTimer);
            autoPlayTimer = null;
            updatePlayButton(false);
          }
        }
      }, 2500);
      updatePlayButton(true);
    }
  }

  function updatePlayButton(playing) {
    const playBtn = document.getElementById('btn-play-event');
    if (playBtn) {
      playBtn.textContent = playing ? '⏸' : '▶';
      playBtn.title = playing ? '暂停' : '自动播放';
    }
  }

  function showTimeline() {
    if (timelinePanel) {
      timelinePanel.classList.remove('hidden');
    }
  }

  function hideTimeline() {
    if (timelinePanel) {
      timelinePanel.classList.add('hidden');
    }
  }

  function clearAll() {
    closeEvent();
    clearRoutes();
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
    updatePlayButton(false);
    hideTimeline();
  }

  return {
    init,
    onEraChanged,
    closeEvent
  };
})();
