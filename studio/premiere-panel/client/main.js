// Polls the studio dashboard for finished edits and imports them into the open Premiere project.
(function () {
  var log = function (m) { var el = document.getElementById("log"); el.textContent = new Date().toLocaleTimeString() + "  " + m + "\n" + el.textContent; };
  var evalJSX = function (code) {
    return new Promise(function (res) { window.__adobe_cep__.evalScript(code, res); });
  };
  var q = function (s) { return JSON.stringify(String(s || "")); };
  var base = function () { return document.getElementById("url").value.replace(/\/$/, ""); };
  var busy = false;

  async function tick(manual) {
    if (busy || (!manual && !document.getElementById("auto").checked)) return;
    busy = true;
    try {
      var r = await fetch(base() + "/api/premiere/jobs?status=queued");
      document.getElementById("st").className = "on";
      var jobs = await r.json();
      if (manual && !jobs.length) log("Tidak ada sequence baru.");
      for (var i = 0; i < jobs.length; i++) {
        var j = jobs[i];
        log("Import: " + j.name);
        var out = await evalJSX("studioImport(" + q(j.xml) + "," + q(j.srt) + "," + q(j.final) + "," + q(j.name) + ")");
        log(out);
        if (String(out).indexOf("OK") === 0) {
          await fetch(base() + "/api/premiere/jobs/" + j.id + "/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msg: out }) });
        }
      }
    } catch (e) {
      document.getElementById("st").className = "off";
      if (manual) log("Dashboard tidak terjangkau: " + e);
    }
    busy = false;
  }
  document.getElementById("now").onclick = function () { tick(true); };
  setInterval(tick, 5000);
  log("Siap. Menunggu edit dari dashboard…");
})();
