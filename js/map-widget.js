/* =========================================================
   map-widget.js — lightweight pan/zoom map with clickable
   markers. No dependencies. Works off a single <img> plus a
   JSON marker list, both supplied via data attributes /
   window.MAP_WIDGET_DATA (see index.html for wiring).
   ========================================================= */
(function () {
  "use strict";

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  class MapWidget {
    constructor(root) {
      this.root = root;
      this.wrap = root.querySelector(".map-widget__stage-wrap");
      this.stage = root.querySelector(".map-widget__stage");
      this.hint = root.querySelector(".map-widget__hint");
      this.zoomReadout = root.querySelector(".map-widget__zoom-readout");
      this.popup = null;
      this.activeMarker = null;

      this.nativeW = parseFloat(this.stage.dataset.width) || 590;
      this.nativeH = parseFloat(this.stage.dataset.height) || 590;

      this.minScale = 0.88;
      this.maxScale = 4;
      this.scale = 1;
      this.x = 0;
      this.y = 0;

      this.isDragging = false;
      this.dragMoved = false;
      this.lastPointer = null;
      this.pointers = new Map();
      this.pinchStartDist = null;
      this.pinchStartScale = null;

      this._bind();
      this._loadMarkers();
      this._fitToContainer();
      this._render();
      window.addEventListener("resize", () => this._fitToContainer(true));
    }

    /* ---------------- setup ---------------- */

    _fitToContainer(preserveCenter) {
      const rect = this.wrap.getBoundingClientRect();
      // Center the native-size map in the viewport at scale 1,
      // then nudge scale so the whole map is visible on first load.
      const fitScale = Math.min(
        rect.width / this.nativeW,
        rect.height / this.nativeH,
      );
      if (!preserveCenter) {
        this.scale = clamp(fitScale, this.minScale, this.maxScale);
        this.x = (rect.width - this.nativeW * this.scale) / 2;
        this.y = (rect.height - this.nativeH * this.scale) / 2;
      }
      this.viewW = rect.width;
      this.viewH = rect.height;
    }

    _loadMarkers() {
      let data = [];
      try {
        data = JSON.parse(this.root.dataset.markers || "[]");
      } catch (e) {
        data = [];
      }
      this.markers = data;

      const legendList = this.root.querySelector(".map-widget__legend-list");

      data.forEach((m, i) => {
        const el = document.createElement("div");
        el.className = "map-widget__marker";
        el.style.left = m.x + "%";
        el.style.top = m.y + "%";
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", m.title);
        el.innerHTML =
          '<svg viewBox="0 0 26 32" xmlns="http://www.w3.org/2000/svg">' +
          '<path class="map-widget__marker-pin" d="M13 0C5.8 0 0 5.8 0 13c0 9.5 13 19 13 19s13-9.5 13-19C26 5.8 20.2 0 13 0z"/>' +
          '<text class="map-widget__marker-icon" x="13" y="17" font-size="12" text-anchor="middle">' +
          (m.icon || i + 1) +
          "</text></svg>";
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (this.dragMoved) return;
          this._openPopup(m, el);
        });
        el.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            this._openPopup(m, el);
          }
        });
        this.stage.appendChild(el);
        m._el = el;

        if (legendList) {
          const item = document.createElement("div");
          item.className = "map-widget__legend-item";
          item.innerHTML = "<span>" + m.title + "</span>";
          item.addEventListener("click", () => this._focusMarker(m));
          legendList.appendChild(item);
        }
      });
    }

    /* ---------------- render ---------------- */

    _render() {
      // Resize the stage's real pixel box (not a transform: scale) so the
      // browser does a genuine raster resize of the <img> — this is what
      // makes `image-rendering: pixelated` actually take effect. Scaling
      // via CSS transform instead gets GPU-bilinear-filtered regardless
      // of image-rendering, which is why that alone looked blurry.
      this.stage.style.width = this.nativeW * this.scale + "px";
      this.stage.style.height = this.nativeH * this.scale + "px";
      this.stage.style.transform =
        "translate(" + this.x + "px," + this.y + "px)";
      if (this.zoomReadout) {
        this.zoomReadout.textContent = Math.round(this.scale * 100) + "%";
      }
    }

    _clampPan() {
      const mapW = this.nativeW * this.scale;
      const mapH = this.nativeH * this.scale;
      const pad = 80; // allow a little play so you can reach the edges

      if (mapW <= this.viewW) {
        this.x = (this.viewW - mapW) / 2;
      } else {
        this.x = clamp(this.x, this.viewW - mapW - pad, pad);
      }
      if (mapH <= this.viewH) {
        this.y = (this.viewH - mapH) / 2;
      } else {
        this.y = clamp(this.y, this.viewH - mapH - pad, pad);
      }
    }

    /* ---------------- zoom ---------------- */

    _zoomAt(clientX, clientY, factor) {
      const rect = this.wrap.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;

      const newScale = clamp(this.scale * factor, this.minScale, this.maxScale);
      const ratio = newScale / this.scale;

      this.x = px - (px - this.x) * ratio;
      this.y = py - (py - this.y) * ratio;
      this.scale = newScale;

      this._clampPan();
      this._render();
    }

    _focusMarker(m) {
      const rect = this.wrap.getBoundingClientRect();
      const targetScale = clamp(4.0, this.minScale, this.maxScale);
      const px = (m.x / 100) * this.nativeW;
      const py = (m.y / 100) * this.nativeH;

      this.scale = targetScale;
      this.x = rect.width / 2 - px * targetScale;
      this.y = rect.height / 2 - py * targetScale;
      this._clampPan();
      this._render();
      this._openPopup(m, m._el);
    }

    /* ---------------- popup ---------------- */

    _openPopup(marker, markerEl) {
      this._closePopup();

      const pop = document.createElement("div");
      pop.className = "map-widget__popup";
      pop.innerHTML =
        (marker.image
          ? '<img class="map-widget__popup-img" src="' +
            marker.image +
            '" alt="' +
            marker.title +
            '">'
          : "") +
        '<div class="map-widget__popup-close" aria-label="Close">✕</div>' +
        '<div class="map-widget__popup-body">' +
        '<div class="map-widget__popup-title">' +
        marker.title +
        "</div>" +
        (marker.desc
          ? '<p class="map-widget__popup-desc">' + marker.desc + "</p>"
          : "") +
        "</div>";

      pop
        .querySelector(".map-widget__popup-close")
        .addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._closePopup();
        });
      pop.addEventListener("click", (ev) => ev.stopPropagation());

      markerEl.appendChild(pop);
      markerEl.classList.add("is-active");
      this.popup = pop;
      this.activeMarker = markerEl;
    }

    _closePopup() {
      if (this.popup) {
        this.popup.remove();
        this.popup = null;
      }
      if (this.activeMarker) {
        this.activeMarker.classList.remove("is-active");
        this.activeMarker = null;
      }
    }

    /* ---------------- input binding ---------------- */

    _bind() {
      const wrap = this.wrap;

      // Mouse drag
      wrap.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        this.isDragging = true;
        this.dragMoved = false;
        this.lastPointer = { x: ev.clientX, y: ev.clientY };
        wrap.classList.add("is-grabbing");
      });
      window.addEventListener("mousemove", (ev) => {
        if (!this.isDragging) return;
        const dx = ev.clientX - this.lastPointer.x;
        const dy = ev.clientY - this.lastPointer.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.dragMoved = true;
        this.x += dx;
        this.y += dy;
        this.lastPointer = { x: ev.clientX, y: ev.clientY };
        this._clampPan();
        this._render();
      });
      window.addEventListener("mouseup", () => {
        this.isDragging = false;
        wrap.classList.remove("is-grabbing");
      });

      // Click empty space closes popup
      wrap.addEventListener("click", () => this._closePopup());

      // Wheel zoom
      wrap.addEventListener(
        "wheel",
        (ev) => {
          ev.preventDefault();
          this._hideHint();
          const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
          this._zoomAt(ev.clientX, ev.clientY, factor);
        },
        { passive: false },
      );

      // Double-click zoom in
      wrap.addEventListener("dblclick", (ev) => {
        this._zoomAt(ev.clientX, ev.clientY, 1.6);
      });

      // Touch: drag + pinch
      wrap.addEventListener(
        "touchstart",
        (ev) => {
          this._hideHint();
          for (const t of ev.changedTouches) {
            this.pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
          }
          if (this.pointers.size === 1) {
            const p = [...this.pointers.values()][0];
            this.isDragging = true;
            this.dragMoved = false;
            this.lastPointer = p;
          } else if (this.pointers.size === 2) {
            this.isDragging = false;
            const pts = [...this.pointers.values()];
            this.pinchStartDist = Math.hypot(
              pts[0].x - pts[1].x,
              pts[0].y - pts[1].y,
            );
            this.pinchStartScale = this.scale;
            this.pinchCenter = {
              x: (pts[0].x + pts[1].x) / 2,
              y: (pts[0].y + pts[1].y) / 2,
            };
          }
        },
        { passive: true },
      );

      wrap.addEventListener(
        "touchmove",
        (ev) => {
          ev.preventDefault();
          for (const t of ev.changedTouches) {
            if (this.pointers.has(t.identifier)) {
              this.pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
            }
          }
          if (this.pointers.size === 1 && this.isDragging) {
            const p = [...this.pointers.values()][0];
            const dx = p.x - this.lastPointer.x;
            const dy = p.y - this.lastPointer.y;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.dragMoved = true;
            this.x += dx;
            this.y += dy;
            this.lastPointer = p;
            this._clampPan();
            this._render();
          } else if (this.pointers.size === 2 && this.pinchStartDist) {
            const pts = [...this.pointers.values()];
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const factor = dist / this.pinchStartDist;
            const newScale = clamp(
              this.pinchStartScale * factor,
              this.minScale,
              this.maxScale,
            );
            const ratio = newScale / this.scale;
            const rect = wrap.getBoundingClientRect();
            const px = this.pinchCenter.x - rect.left;
            const py = this.pinchCenter.y - rect.top;
            this.x = px - (px - this.x) * ratio;
            this.y = py - (py - this.y) * ratio;
            this.scale = newScale;
            this._clampPan();
            this._render();
          }
        },
        { passive: false },
      );

      const touchEnd = (ev) => {
        for (const t of ev.changedTouches) this.pointers.delete(t.identifier);
        if (this.pointers.size === 0) {
          this.isDragging = false;
          this.pinchStartDist = null;
        }
      };
      wrap.addEventListener("touchend", touchEnd, { passive: true });
      wrap.addEventListener("touchcancel", touchEnd, { passive: true });

      // Buttons
      const zoomIn = this.root.querySelector('[data-map-action="zoom-in"]');
      const zoomOut = this.root.querySelector('[data-map-action="zoom-out"]');
      const reset = this.root.querySelector('[data-map-action="reset"]');
      if (zoomIn)
        zoomIn.addEventListener("click", () => {
          const r = wrap.getBoundingClientRect();
          this._zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.3);
        });
      if (zoomOut)
        zoomOut.addEventListener("click", () => {
          const r = wrap.getBoundingClientRect();
          this._zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.3);
        });
      if (reset)
        reset.addEventListener("click", () => {
          this._closePopup();
          this._fitToContainer(false);
          this._render();
        });
    }

    _hideHint() {
      if (this.hint && !this.hint.classList.contains("is-hidden")) {
        this.hint.classList.add("is-hidden");
      }
    }
  }

  function init() {
    document.querySelectorAll(".map-widget").forEach((el) => new MapWidget(el));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
