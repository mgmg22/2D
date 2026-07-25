/**
 * main.js - 应用入口
 * 职责：模块编排、默认加载第一个时代
 */
(function () {
  "use strict";

  function init() {
    const map = MapModule.init("map");

    if (typeof ScenarioModule !== 'undefined') {
      ScenarioModule.init(map);
    }

    UIController.onEraSelected((data, eraId) => {
      console.log("当前时代:", eraId, data.name);
    });

    // manifest 加载完成后再选中第一个时代；失败时 UIController 已渲染重试按钮
    UIController.init()
      .then(() => {
        const firstBtn = document.querySelector("#era-list .era-btn");
        if (firstBtn) {
          UIController.selectEra(firstBtn.dataset.era);
        }
      })
      .catch((err) => {
        console.error("时代列表加载失败:", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
