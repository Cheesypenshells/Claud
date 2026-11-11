// ExtendScript side of Studio Bridge (Premiere Pro).
function _findBin(root, name) {
  for (var i = 0; i < root.children.numItems; i++) {
    var c = root.children[i];
    if (c.type === ProjectItemType.BIN && c.name === name) return c;
  }
  return root.createBin(name);
}

function _findItem(bin, ext) {
  for (var i = bin.children.numItems - 1; i >= 0; i--) {
    var c = bin.children[i];
    try { if (c.getMediaPath && c.getMediaPath().toLowerCase().slice(-ext.length) === ext) return c; } catch (e) {}
  }
  return null;
}

function studioImport(xmlPath, srtPath, finalPath, name) {
  try {
    if (!app.project) return "ERR: buka/buat project Premiere dulu";
    var root = app.project.rootItem;
    var studio = _findBin(root, "Studio");
    var bin = studio.createBin(name + " " + (new Date()).toTimeString().slice(0, 5));
    var before = app.project.sequences.numSequences;
    app.project.importFiles([xmlPath], true, bin, false);
    if (srtPath && new File(srtPath).exists) app.project.importFiles([srtPath], true, bin, false);
    if (finalPath && new File(finalPath).exists) app.project.importFiles([finalPath], true, bin, false);
    var seq = null;
    if (app.project.sequences.numSequences > before) seq = app.project.sequences[app.project.sequences.numSequences - 1];
    if (seq) {
      app.project.openSequence(seq.sequenceID);
      var srt = _findItem(bin, ".srt");
      if (srt && seq.createCaptionTrack) {
        try { seq.createCaptionTrack(srt, 0); } catch (e) {}
      }
    }
    return "OK: " + (seq ? "sequence '" + seq.name + "' dibuka" : "file di-import ke bin " + bin.name);
  } catch (e) {
    return "ERR: " + e.toString();
  }
}
