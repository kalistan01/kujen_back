const { Note } = require("../../models");

const NOTE_KEY = "shared";
const MAX_HTML = 100000;
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "div",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "blockquote",
]);

function sanitizeNoteHtml(value) {
  let html = String(value || "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<\/?([a-z0-9:-]+)(?:\s[^>]*)?>/gi, (match, tag) => {
    const name = String(tag).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (name === "br") return "<br>";
    return match.startsWith("</") ? `</${name}>` : `<${name}>`;
  });
  return html.trim();
}

exports.getNote = async (req, res) => {
  try {
    const note = await Note.findOne({ key: NOTE_KEY }).lean();
    return res.status(200).json({
      success: true,
      data: {
        html: note?.html || "",
        updatedAt: note?.updatedAt || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not load the note.",
    });
  }
};

exports.saveNote = async (req, res) => {
  try {
    const html = sanitizeNoteHtml(req.body?.html);
    if (html.length > MAX_HTML) {
      return res.status(400).json({
        success: false,
        message: "Note is too long.",
      });
    }
    const note = await Note.findOneAndUpdate(
      { key: NOTE_KEY },
      {
        $set: {
          html,
          updatedBy: req.tokenData?.userid || undefined,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.status(200).json({
      success: true,
      message: "Note saved.",
      data: {
        html: note.html || "",
        updatedAt: note.updatedAt || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not save the note.",
    });
  }
};
