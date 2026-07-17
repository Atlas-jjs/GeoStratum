(function () {
  "use strict";

  var logo = document.getElementById("dvd-logo");
  if (!logo) return;

  var LOGO_SIZE = 160;
  var SPEED = 1.8;
  var HUE_STEPS = [0, 30, 60, 120, 180, 210, 260, 300];

  var width = window.innerWidth;
  var height = window.innerHeight;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomSign() {
    return Math.random() < 0.5 ? 1 : -1;
  }

  // Keeps the initial spawn point inside the travel bounds, even on very
  // small viewports where (dimension - LOGO_SIZE * 2) could go negative.
  function randomStart(dimension) {
    var span = dimension - LOGO_SIZE * 2;
    var offset = span > 0 ? Math.random() * span : 0;
    return clamp(offset + LOGO_SIZE, 0, Math.max(dimension - LOGO_SIZE, 0));
  }

  var x = randomStart(width);
  var y = randomStart(height);

  // Angle between 25-65 degrees keeps the bounce from drifting
  // near-horizontal or near-vertical.
  var angle = (25 + Math.random() * 40) * (Math.PI / 180);
  var vx = randomSign() * Math.cos(angle);
  var vy = randomSign() * Math.sin(angle);

  // Hue cycling on wall hit
  var hueIndex = 0;

  function cycleHue() {
    hueIndex = (hueIndex + 1) % HUE_STEPS.length;
    var hue = HUE_STEPS[hueIndex];
    logo.style.filter =
      "hue-rotate(" + hue + "deg) saturate(1.25) brightness(0.95)";
    logo.style.boxShadow =
      "0 0 40px hsla(" +
      hue +
      ",80%,55%,0.38), " +
      "0 0 80px hsla(" +
      hue +
      ",80%,55%,0.12)";
  }

  function tick() {
    width = window.innerWidth;
    height = window.innerHeight;

    var maxX = width - LOGO_SIZE;
    var maxY = height - LOGO_SIZE;

    x += vx * SPEED;
    y += vy * SPEED;

    var hitWall = false;

    if (x <= 0) {
      x = 0;
      vx = Math.abs(vx);
      hitWall = true;
    } else if (x >= maxX) {
      x = maxX;
      vx = -Math.abs(vx);
      hitWall = true;
    }

    if (y <= 0) {
      y = 0;
      vy = Math.abs(vy);
      hitWall = true;
    } else if (y >= maxY) {
      y = maxY;
      vy = -Math.abs(vy);
      hitWall = true;
    }

    if (hitWall) cycleHue();

    logo.style.left = x + "px";
    logo.style.top = y + "px";

    requestAnimationFrame(tick);
  }

  tick();
})();
