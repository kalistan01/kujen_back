const mongoose = require("mongoose");
const { AssignLorry } = require("../../models");
const fileStore = require("../../lib/fileStore");
const {
  completedLockMessage,
  syncAssignment,
} = require("./assignLorry.controller");

const MAX_DOC_BYTES = 100 * 1024;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_DOC_BASE64_CHARS = 200000;
const MAX_AUDIO_BASE64_CHARS = 3 * 1024 * 1024;
const DOCUMENT_SLOTS = {
  "weight-sheet": { label: "Weight sheet", kind: "document" },
  "gate-pass": { label: "Gate pass", kind: "document" },
  audio: { label: "Audio", kind: "audio" },
};
const DOC_MIME = new Set(["image/jpeg", "application/pdf"]);
const AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "video/mp4",
]);

function invalidId(res) {
  return res.status(400).json({
    success: false,
    message: "Invalid ID format provided.",
  });
}

function idsAreValid(id, containerId, docId) {
  if (!mongoose.Types.ObjectId.isValid(id)) return false;
  if (!mongoose.Types.ObjectId.isValid(containerId)) return false;
  if (docId !== undefined && !mongoose.Types.ObjectId.isValid(docId)) return false;
  return true;
}

function publicDocument(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    slot: doc.slot,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    size: doc.size,
    uploadedAt: doc.uploadedAt,
  };
}

function normalizeMime(mimeType) {
  const raw = String(mimeType || "").toLowerCase().trim();
  if (raw === "audio/mp3") return "audio/mpeg";
  if (raw === "audio/x-wav" || raw === "audio/wave") return "audio/wav";
  return raw;
}

function decodePayload(data, maxBytes, maxBase64Chars) {
  const raw = String(data || "")
    .replace(/^data:[^;]+;base64,/i, "")
    .replace(/\s/g, "");
  if (!raw || raw.length > maxBase64Chars) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(raw)) return null;
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length || buffer.length > maxBytes) return null;
  return buffer;
}

function matchesType(buffer, mimeType) {
  if (mimeType === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  if (mimeType === "application/pdf") {
    return buffer.length >= 5 && buffer.slice(0, 5).toString("latin1") === "%PDF-";
  }
  if (mimeType === "audio/mpeg") {
    if (buffer.length >= 3 && buffer.slice(0, 3).toString("latin1") === "ID3") {
      return true;
    }
    return (
      buffer.length >= 2 &&
      buffer[0] === 0xff &&
      (buffer[1] & 0xe0) === 0xe0
    );
  }
  if (mimeType === "audio/wav") {
    return (
      buffer.length >= 12 &&
      buffer.slice(0, 4).toString("latin1") === "RIFF" &&
      buffer.slice(8, 12).toString("latin1") === "WAVE"
    );
  }
  if (mimeType === "audio/ogg") {
    return buffer.length >= 4 && buffer.slice(0, 4).toString("latin1") === "OggS";
  }
  if (mimeType === "audio/webm") {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    );
  }
  if (
    mimeType === "audio/mp4" ||
    mimeType === "video/mp4" ||
    mimeType === "audio/aac"
  ) {
    if (buffer.length < 12) return false;
    const brand = buffer.slice(4, 8).toString("latin1");
    if (brand === "ftyp") return true;
    // Some AAC ADTS streams start with 0xFFF sync.
    if (mimeType === "audio/aac") {
      return buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0;
    }
  }
  return false;
}

function extensionFor(mimeType) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav") return "wav";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/webm") return "webm";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "audio/aac") return "aac";
  return "bin";
}

function safeName(name, mimeType) {
  const cleaned = String(name || "file")
    .replace(/[/\\?%*:|"<>\r\n]/g, "")
    .trim()
    .slice(0, 80);
  const base = cleaned || "file";
  const ext = extensionFor(mimeType);
  const pattern = new RegExp(`\\.${ext}$`, "i");
  if (mimeType === "image/jpeg" && !/\.jpe?g$/i.test(base)) return `${base}.jpg`;
  if (!pattern.test(base) && ext !== "bin") return `${base}.${ext}`;
  return base;
}

function asciiFilename(name) {
  return String(name || "file").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
}

async function loadContainer(id, containerId) {
  const assignment = await AssignLorry.findOne({
    _id: id,
    "containers._id": containerId,
  });
  const container = assignment?.containers?.id(containerId);
  return { assignment, container };
}

exports.uploadContainerDocument = async (req, res) => {
  let storageKey = "";
  try {
    const { id, containerId } = req.params;
    if (!idsAreValid(id, containerId)) return invalidId(res);

    const slot = String(req.body?.slot || "");
    const slotMeta = DOCUMENT_SLOTS[slot];
    if (!slotMeta) {
      return res.status(400).json({
        success: false,
        message: "Choose Weight sheet, Gate pass, or Audio.",
      });
    }

    const mimeType = normalizeMime(req.body?.mimeType);
    const isAudio = slotMeta.kind === "audio";
    if (isAudio) {
      if (!AUDIO_MIME.has(mimeType)) {
        return res.status(400).json({
          success: false,
          message: "Only an MP3, M4A, MP4, WAV, OGG, or WebM audio file can be saved.",
        });
      }
    } else if (!DOC_MIME.has(mimeType)) {
      return res.status(400).json({
        success: false,
        message: "Only a JPEG image or a PDF can be saved.",
      });
    }

    const maxBytes = isAudio ? MAX_AUDIO_BYTES : MAX_DOC_BYTES;
    const maxBase64 = isAudio ? MAX_AUDIO_BASE64_CHARS : MAX_DOC_BASE64_CHARS;
    const buffer = decodePayload(req.body?.data, maxBytes, maxBase64);
    if (!buffer || !matchesType(buffer, mimeType)) {
      return res.status(400).json({
        success: false,
        message: isAudio
          ? "The file must be a supported audio or MP4 file under 2MB."
          : "The file must be a JPEG or PDF under 100KB.",
      });
    }

    const { container } = await loadContainer(id, containerId);
    if (!container) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found or container does not exist.",
      });
    }
    const locked = completedLockMessage(req.authRole, container);
    if (locked) {
      return res.status(403).json({ success: false, message: locked });
    }

    const previous = (container.documents || []).find((item) => item.slot === slot);

    const docId = new mongoose.Types.ObjectId();
    const ext = extensionFor(mimeType);
    storageKey = `containers/${id}/${containerId}/${docId}.${ext}`;
    await fileStore.put(storageKey, buffer);

    const doc = {
      _id: docId,
      slot,
      originalName: safeName(req.body?.name, mimeType),
      mimeType,
      size: buffer.length,
      storageKey,
      uploadedAt: new Date(),
      uploadedBy: req.authUser?._id,
    };

    const updated = await AssignLorry.findOneAndUpdate(
      { _id: id, "containers._id": containerId },
      { $push: { "containers.$.documents": doc } },
      { new: true }
    );

    if (!updated) {
      await fileStore.remove(storageKey);
      storageKey = "";
      return res.status(404).json({
        success: false,
        message: "Assignment not found or container does not exist.",
      });
    }

    if (previous?.storageKey) {
      await AssignLorry.findOneAndUpdate(
        { _id: id, "containers._id": containerId },
        { $pull: { "containers.$.documents": { _id: previous._id } } }
      );
      try {
        await fileStore.remove(previous.storageKey);
      } catch (error) {
        console.error("Could not remove the previous container file:", error.message);
      }
    }

    syncAssignment(req, "updated", id);
    return res.status(200).json({
      success: true,
      message: isAudio ? "Audio uploaded." : "Document uploaded.",
      data: publicDocument(doc),
    });
  } catch (error) {
    if (storageKey) {
      try {
        await fileStore.remove(storageKey);
      } catch (cleanupError) {
        console.error("Could not remove container file:", cleanupError.message);
      }
    }
    return res.status(500).json({
      success: false,
      message: "Could not upload the document. Please try again.",
    });
  }
};

exports.getContainerDocument = async (req, res) => {
  try {
    const { id, containerId, docId } = req.params;
    if (!idsAreValid(id, containerId, docId)) return invalidId(res);

    const { container } = await loadContainer(id, containerId);
    const doc = container?.documents?.id(docId);
    if (!doc?.storageKey) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    let buffer;
    try {
      buffer = await fileStore.get(doc.storageKey);
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({
          success: false,
          message: "Document not found.",
        });
      }
      throw error;
    }

    res.status(200);
    res.set("Content-Type", doc.mimeType);
    res.set("Content-Length", buffer.length);
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.set(
      "Content-Disposition",
      `inline; filename="${asciiFilename(doc.originalName)}"`
    );
    return res.end(buffer);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not open the document. Please try again.",
    });
  }
};

exports.deleteContainerDocument = async (req, res) => {
  try {
    const { id, containerId, docId } = req.params;
    if (!idsAreValid(id, containerId, docId)) return invalidId(res);

    const { container } = await loadContainer(id, containerId);
    const doc = container?.documents?.id(docId);
    if (!container || !doc) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }
    const locked = completedLockMessage(req.authRole, container);
    if (locked) {
      return res.status(403).json({ success: false, message: locked });
    }

    const updated = await AssignLorry.findOneAndUpdate(
      { _id: id, "containers._id": containerId },
      { $pull: { "containers.$.documents": { _id: doc._id } } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    if (doc.storageKey) {
      await fileStore.remove(doc.storageKey);
    }
    syncAssignment(req, "updated", id);
    return res.status(200).json({
      success: true,
      message: "Document removed.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not remove the document. Please try again.",
    });
  }
};
