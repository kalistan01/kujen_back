const mongoose = require("mongoose");
const { AssignLorry } = require("../../models");
const fileStore = require("../../lib/fileStore");
const {
  completedLockMessage,
  syncAssignment,
} = require("./assignLorry.controller");

const MAX_BYTES = 100 * 1024;
const MAX_BASE64_CHARS = 200000;
const DOCUMENT_SLOTS = {
  "weight-sheet": "Weight sheet",
  "gate-pass": "Gate pass",
};

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

function decodePayload(data) {
  const raw = String(data || "")
    .replace(/^data:[^;]+;base64,/i, "")
    .replace(/\s/g, "");
  if (!raw || raw.length > MAX_BASE64_CHARS) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(raw)) return null;
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
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
  return false;
}

function safeName(name, mimeType) {
  const cleaned = String(name || "file")
    .replace(/[/\\?%*:|"<>\r\n]/g, "")
    .trim()
    .slice(0, 80);
  const base = cleaned || "file";
  if (mimeType === "image/jpeg" && !/\.jpe?g$/i.test(base)) return `${base}.jpg`;
  if (mimeType === "application/pdf" && !/\.pdf$/i.test(base)) return `${base}.pdf`;
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

    const mimeType = String(req.body?.mimeType || "");
    if (mimeType !== "image/jpeg" && mimeType !== "application/pdf") {
      return res.status(400).json({
        success: false,
        message: "Only a JPEG image or a PDF can be saved.",
      });
    }

    const buffer = decodePayload(req.body?.data);
    if (!buffer || !matchesType(buffer, mimeType)) {
      return res.status(400).json({
        success: false,
        message: "The file must be a JPEG or PDF under 100KB.",
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

    const slot = String(req.body?.slot || "");
    if (!DOCUMENT_SLOTS[slot]) {
      return res.status(400).json({
        success: false,
        message: "Choose Weight sheet or Gate pass.",
      });
    }
    const previous = (container.documents || []).find((item) => item.slot === slot);

    const docId = new mongoose.Types.ObjectId();
    const ext = mimeType === "application/pdf" ? "pdf" : "jpg";
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
      message: "Document uploaded.",
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
