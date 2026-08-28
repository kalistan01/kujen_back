const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const { AssignLorry } = require("../../models");
const { canSeeField } = require("../../middleware/rbac");
const {
  applyHeldUpToContainers,
  loadHeldUpRates,
} = require("../../lib/heldUpCalc");
const { formatFclRecord } = require("../../lib/fcl");

const CHARGE_FIELDS = [
  ["weight", "Weight"],
  ["dayHire", "Day Hire"],
  ["outHire", "Out Hire"],
  ["other", "Other"],
  ["heldUp", "Held Up"],
  ["return", "Return"],
];

const COMMISSION_FIELDS = [
  ["agentFee", "Agent Fee"],
  ["transportCommission", "Transport Commission"],
];

const toAmount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const money = (value) =>
  `Rs ${toAmount(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const part = value.substring(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
      const [y, m, d] = part.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const nameOf = (value) =>
  value && typeof value === "object" ? value.fullName || "" : value || "";

const visibleCharges = (role) =>
  CHARGE_FIELDS.filter(([key]) => canSeeField(role, key));
const visibleCommissions = (role) =>
  COMMISSION_FIELDS.filter(([key]) => canSeeField(role, key));

const containerTotal = (c = {}, role) =>
  visibleCharges(role).reduce((sum, [key]) => sum + toAmount(c[key]), 0);

const fileBase = (assignment) =>
  `RG-Business-transport-BL-${assignment?.blNo || "assignment"}`.replace(
    /[\\/:*?"<>|]/g,
    "-"
  );

const lorryLabel = (c = {}) => {
  const num = c.lorryNum || c.lorryId?.lorryNum || "Unassigned";
  const cap = c.capacity || c.lorryId?.capacity;
  return cap ? `${num} / ${cap} ft` : num;
};

const ownerLabel = (c = {}) =>
  (c.lorryOwner || c.lorryId?.owner?.ownerName || "").toString().toUpperCase();

const destLabel = (c = {}) =>
  c.destinationlocation || c.destination?.location || "";

const containerPaid = (c = {}, role) =>
  (canSeeField(role, "advanced") ? toAmount(c.advanced) : 0) +
  (canSeeField(role, "balancePaid") ? toAmount(c.balancePaid) : 0);

const assignmentFinancials = (containers = [], role) => {
  const chargeFields = visibleCharges(role);
  const commissionFields = visibleCommissions(role);
  const charges = Object.fromEntries(
    chargeFields.map(([key]) => [
      key,
      containers.reduce((sum, c) => sum + toAmount(c?.[key]), 0),
    ])
  );
  const commissions = Object.fromEntries(
    commissionFields.map(([key]) => [
      key,
      containers.reduce((sum, c) => sum + toAmount(c?.[key]), 0),
    ])
  );
  const total = chargeFields.reduce((sum, [key]) => sum + charges[key], 0);
  const advanced = containers.reduce(
    (sum, c) => sum + toAmount(c?.advanced),
    0
  );
  const balancePaid = containers.reduce(
    (sum, c) => sum + toAmount(c?.balancePaid),
    0
  );
  return {
    charges,
    commissions,
    total,
    advanced,
    balancePaid,
    remaining: total - advanced - balancePaid,
  };
};

async function loadAssignment(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const assignment = await AssignLorry.findById(id)
    .populate({ path: "createdBy", select: "fullName" })
    .populate({ path: "updatedBy", select: "fullName" })
    .populate({ path: "containers.createdBy", select: "fullName" })
    .populate({ path: "containers.updatedBy", select: "fullName" })
    .populate({ path: "containers.destination", select: "location type" })
    .populate({
      path: "containers.lorryId",
      select: "lorryNum capacity owner",
      populate: { path: "owner", select: "ownerName" },
    })
    .lean();
  if (!assignment) return null;

  const rates = await loadHeldUpRates();
  const containers = applyHeldUpToContainers(
    (assignment.containers || []).filter((c) => c && (c.containerNo || c._id)),
    rates
  ).map((c) => ({
    ...c,
    lorryNum: c.lorryNum || c.lorryId?.lorryNum,
    capacity: c.capacity || c.lorryId?.capacity,
    lorryOwner: c.lorryOwner || c.lorryId?.owner?.ownerName,
    destinationlocation: c.destinationlocation || c.destination?.location,
    createdBy: nameOf(c.createdBy),
    updatedBy: nameOf(c.updatedBy),
  }));

  const allCompleted =
    containers.length > 0 &&
    containers.every((c) => c.status === "completed");

  return {
    ...assignment,
    containers,
    createdBy: nameOf(assignment.createdBy),
    updatedBy: nameOf(assignment.updatedBy),
    status: allCompleted ? "completed" : "pending",
  };
}

function sendFile(res, buffer, filename, contentType) {
  res.setHeader("Content-Type", contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
  res.setHeader("Content-Length", buffer.length);
  return res.end(buffer);
}

async function buildExcel(assignment, role) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RG Business transport";
  const sheet = workbook.addWorksheet("Assignment");

  sheet.columns = [
    { header: "BL Number", key: "blNo", width: 16 },
    { header: "Assignment Status", key: "status", width: 18 },
    { header: "Cusdec Date", key: "cusdecDate", width: 14 },
    { header: "Cusdec Number", key: "cusdecNo", width: 16 },
    { header: "Registration No.", key: "regNo", width: 16 },
    { header: "Item", key: "item", width: 16 },
    { header: "Exporter", key: "exporter", width: 16 },
    { header: "Importer", key: "importer", width: 16 },
    { header: "Container No", key: "containerNo", width: 16 },
    { header: "VOC No", key: "vocNo", width: 14 },
    { header: "Container Status", key: "containerStatus", width: 16 },
    { header: "FCL Status", key: "fclStatus", width: 22 },
    { header: "Lorry", key: "lorry", width: 18 },
    { header: "Owner", key: "owner", width: 16 },
    { header: "Destination", key: "destination", width: 16 },
    { header: "Loading Date", key: "loadingDate", width: 14 },
    { header: "Demount Date", key: "demoundDate", width: 14 },
    ...(canSeeField(role, "weight")
      ? [{ header: "Weight", key: "weight", width: 12 }]
      : []),
    ...(canSeeField(role, "dayHire")
      ? [{ header: "Day Hire", key: "dayHire", width: 12 }]
      : []),
    ...(canSeeField(role, "advanced")
      ? [{ header: "Advanced", key: "advanced", width: 12 }]
      : []),
    ...(canSeeField(role, "advancedDate")
      ? [{ header: "Advanced Date", key: "advancedDate", width: 14 }]
      : []),
    ...(canSeeField(role, "balancePaid")
      ? [{ header: "Balance Paid", key: "balancePaid", width: 14 }]
      : []),
    ...(canSeeField(role, "balanceDate")
      ? [{ header: "Balance Date", key: "balanceDate", width: 14 }]
      : []),
    ...(canSeeField(role, "outHire")
      ? [{ header: "Out Hire", key: "outHire", width: 12 }]
      : []),
    ...(canSeeField(role, "other")
      ? [{ header: "Other", key: "other", width: 12 }]
      : []),
    ...(canSeeField(role, "heldUp")
      ? [{ header: "Held Up", key: "heldUp", width: 12 }]
      : []),
    ...(canSeeField(role, "return")
      ? [{ header: "Return", key: "return", width: 12 }]
      : []),
    ...(canSeeField(role, "totals")
      ? [
          { header: "Container Total", key: "total", width: 14 },
          { header: "Paid", key: "paid", width: 12 },
          { header: "Balance", key: "balance", width: 12 },
        ]
      : []),
  ];

  const moneyKeys = [
    "weight",
    "dayHire",
    "advanced",
    "balancePaid",
    "outHire",
    "other",
    "heldUp",
    "return",
    "total",
    "paid",
    "balance",
  ].filter((key) =>
    key === "total" || key === "paid" || key === "balance"
      ? canSeeField(role, "totals")
      : canSeeField(role, key)
  );

  const containers = assignment.containers?.length
    ? assignment.containers
    : [{}];

  const sums = {
    weight: 0,
    dayHire: 0,
    advanced: 0,
    balancePaid: 0,
    outHire: 0,
    other: 0,
    heldUp: 0,
    return: 0,
    total: 0,
    paid: 0,
    balance: 0,
  };

  containers.forEach((c) => {
    const total = containerTotal(c, role);
    const paid = containerPaid(c, role);
    const row = {
      blNo: assignment.blNo || "",
      status: (assignment.status || "pending").replace(/-/g, " "),
      cusdecDate: formatDate(assignment.cusdecDate),
      cusdecNo: assignment.cusdecNo || "",
      regNo: assignment.regNo || "",
      item: assignment.item || "",
      exporter: assignment.exporter || "",
      importer: assignment.importer || "",
      containerNo: c.containerNo || "",
      vocNo: c.vocNo || "",
      containerStatus: (c.status || "").replace(/-/g, " "),
      fclStatus: formatFclRecord(c.fcl),
      lorry: c.containerNo ? lorryLabel(c) : "",
      owner: c.containerNo ? ownerLabel(c) : "",
      destination: c.containerNo ? destLabel(c) : "",
      loadingDate: formatDate(c.loadingDate),
      demoundDate: formatDate(c.demoundDate),
      weight: toAmount(c.weight),
      dayHire: toAmount(c.dayHire),
      advanced: toAmount(c.advanced),
      advancedDate: formatDate(c.advancedDate),
      balancePaid: toAmount(c.balancePaid),
      balanceDate: formatDate(c.balanceDate),
      outHire: toAmount(c.outHire),
      other: toAmount(c.other),
      heldUp: toAmount(c.heldUp),
      return: toAmount(c.return),
      total,
      paid,
      balance: total - paid,
    };
    sheet.addRow(row);
    moneyKeys.forEach((key) => {
      sums[key] += Number(row[key] || 0);
    });
  });

  sheet.addRow({ blNo: "TOTAL", ...sums });

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1B5A9D" },
  };
  sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(sheet.rowCount).font = { bold: true };
  moneyKeys.forEach((key) => {
    sheet.getColumn(key).numFmt = "#,##0.00";
  });

  return workbook.xlsx.writeBuffer();
}

function buildPdf(assignment, role) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const navy = "#1B5A9D";
    const gold = "#C5CCD4";
    const pageW = doc.page.width;
    const containers = assignment.containers || [];
    const fin = assignmentFinancials(containers, role);
    const status = (assignment.status || "pending").replace(/-/g, " ");

    doc.rect(0, 0, pageW, 78).fill(navy);
    doc.roundedRect(36, 24, 36, 36, 6).fill("#111111");
    doc.fillColor(navy).font("Helvetica-Bold").fontSize(11).text("RG", 36, 36, {
      width: 36,
      align: "center",
    });
    doc.fillColor("#FFFFFF").fontSize(18).text("RG Business transport", 82, 28);
    doc.fillColor(gold).font("Helvetica").fontSize(9).text("LOGISTICS", 82, 50);
    doc.fillColor("#FFFFFF").fontSize(8).text("BILL OF LADING", 0, 26, {
      align: "right",
      width: pageW - 36,
    });
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(assignment.blNo || "—", 0, 40, {
        align: "right",
        width: pageW - 36,
      });
    doc
      .font("Helvetica")
      .fillColor(gold)
      .fontSize(10)
      .text(status, 0, 56, { align: "right", width: pageW - 36 });

    let y = 96;
    const section = (title) => {
      if (y > 740) {
        doc.addPage();
        y = 40;
      }
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(10).text(title.toUpperCase(), 36, y);
      doc.moveTo(36, y + 14).lineTo(pageW - 36, y + 14).strokeColor(gold).lineWidth(1.5).stroke();
      y += 22;
    };

    const kv = (items) => {
      const colW = (pageW - 72) / 3;
      items.forEach((item, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 36 + col * colW;
        const yy = y + row * 28;
        doc.fillColor("#667085").font("Helvetica").fontSize(8).text(item[0], x, yy);
        doc.fillColor(navy).font("Helvetica-Bold").fontSize(10).text(String(item[1] ?? "—") || "—", x, yy + 11, {
          width: colW - 8,
        });
      });
      y += Math.ceil(items.length / 3) * 28 + 8;
    };

    section("Assignment details");
    kv([
      ["Cusdec Date", formatDate(assignment.cusdecDate)],
      ["Cusdec Number", assignment.cusdecNo],
      ["Registration No.", assignment.regNo],
      ["Item", assignment.item],
      ["Exporter", assignment.exporter],
      ["Importer", assignment.importer],
    ]);

    section(`Containers (${containers.length})`);
    if (!containers.length) {
      doc.fillColor("#667085").font("Helvetica").fontSize(10).text("No containers added.", 36, y);
      y += 20;
    }

    containers.forEach((c, index) => {
      const tot = containerTotal(c, role);
      const paid = containerPaid(c, role);
      if (y > 620) {
        doc.addPage();
        y = 40;
      }
      doc.roundedRect(36, y, pageW - 72, 18, 3).fill("#F3F4F6");
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(10)
        .text(`${index + 1}. ${c.containerNo || "—"}`, 42, y + 5);
      doc.font("Helvetica").fontSize(9)
        .text((c.status || "pending").replace(/-/g, " "), 36, y + 5, {
          width: pageW - 84,
          align: "right",
        });
      y += 26;
      kv([
        ["VOC No.", c.vocNo],
        ["Lorry", lorryLabel(c)],
        ["Owner", ownerLabel(c)],
        ["Destination", destLabel(c)],
        ["Loading", formatDate(c.loadingDate)],
        ["Demount", formatDate(c.demoundDate)],
        ["FCL Status", formatFclRecord(c.fcl)],
      ]);

      const charges = [
        canSeeField(role, "weight") ? ["Weight", c.weight] : null,
        canSeeField(role, "dayHire") ? ["Day Hire", c.dayHire] : null,
        canSeeField(role, "advanced")
          ? [
              c.advancedDate
                ? `Advanced (${formatDate(c.advancedDate)})`
                : "Advanced",
              c.advanced,
            ]
          : null,
        canSeeField(role, "balancePaid")
          ? [
              c.balanceDate
                ? `Balance Paid (${formatDate(c.balanceDate)})`
                : "Balance Paid",
              c.balancePaid,
            ]
          : null,
        canSeeField(role, "outHire") ? ["Out Hire", c.outHire] : null,
        canSeeField(role, "other") ? ["Other", c.other] : null,
        canSeeField(role, "heldUp") ? ["Held Up", c.heldUp] : null,
        canSeeField(role, "return") ? ["Return", c.return] : null,
      ].filter(Boolean);
      const tableTop = y;
      charges.forEach((row, i) => {
        const col = i % 2;
        const rowI = Math.floor(i / 2);
        const x = 36 + col * ((pageW - 72) / 2);
        const yy = tableTop + rowI * 16;
        doc.fillColor("#667085").font("Helvetica").fontSize(9).text(row[0], x, yy);
        doc.fillColor(navy).font("Helvetica-Bold").text(money(row[1]), x, yy, {
          width: (pageW - 88) / 2,
          align: "right",
        });
      });
      y = tableTop + Math.ceil(charges.length / 2) * 16 + 8;

      const boxW = (pageW - 88) / 3;
      (canSeeField(role, "totals")
        ? [
            ["Total", money(tot), false],
            ["Paid", money(paid), false],
            ["Balance", money(tot - paid), true],
          ]
        : []
      ).forEach((box, i) => {
        const x = 36 + i * (boxW + 8);
        if (box[2]) doc.roundedRect(x, y, boxW, 28, 3).fill(navy);
        else doc.roundedRect(x, y, boxW, 28, 3).strokeColor("#D0D5DD").lineWidth(0.6).stroke();
        doc.fillColor(box[2] ? "#FFFFFF" : "#667085").font("Helvetica").fontSize(8).text(box[0], x + 8, y + 5);
        doc.fillColor(box[2] ? "#FFFFFF" : navy).font("Helvetica-Bold").fontSize(11).text(box[1], x + 8, y + 14);
      });
      y += 42;
    });

    section("Financial summary");
    const summaryRows = [
      ...visibleCharges(role).map(([key, label]) => [
        label,
        money(fin.charges[key]),
        false,
      ]),
      ...(canSeeField(role, "totals")
        ? [
            ["Total", money(fin.total), false],
            ...(canSeeField(role, "advanced")
              ? [["Advanced", money(fin.advanced), false]]
              : []),
            ...(canSeeField(role, "balancePaid")
              ? [["Balance Paid", money(fin.balancePaid), false]]
              : []),
            ["Remaining", money(fin.remaining), true],
          ]
        : []),
    ];
    if (y + summaryRows.length * 16 > 760) {
      doc.addPage();
      y = 40;
    }
    summaryRows.forEach((row, i) => {
      const highlight = Boolean(row[2]);
      doc
        .fillColor(highlight ? navy : "#667085")
        .font(highlight ? "Helvetica-Bold" : "Helvetica")
        .fontSize(10)
        .text(row[0], 320, y + i * 16);
      doc
        .fillColor(navy)
        .font("Helvetica-Bold")
        .text(row[1], 400, y + i * 16, {
          width: 160,
          align: "right",
        });
    });
    y += summaryRows.length * 16 + 16;

    if (y > 800) {
      doc.addPage();
      y = 40;
    }
    doc.fillColor("#667085").fontSize(8).text(
      `Generated ${formatDateTime(new Date().toISOString())}  ·  RG Business transport`,
      36,
      y,
      { width: pageW - 72, align: "center" }
    );

    doc.end();
  });
}

exports.exportAssignmentExcel = async (req, res) => {
  try {
    const assignment = await loadAssignment(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found." });
    }
    const buffer = await buildExcel(assignment, req.authRole);
    return sendFile(
      res,
      Buffer.from(buffer),
      `${fileBase(assignment)}.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to export Excel.",
      error: error.message,
    });
  }
};

exports.exportAssignmentPdf = async (req, res) => {
  try {
    const assignment = await loadAssignment(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: "Assignment not found." });
    }
    const buffer = await buildPdf(assignment, req.authRole);
    return sendFile(
      res,
      buffer,
      `${fileBase(assignment)}.pdf`,
      "application/pdf"
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to export PDF.",
      error: error.message,
    });
  }
};

function parseDay(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
}

function assignmentStatus(assignment) {
  const containers = assignment.containers || [];
  const allCompleted = containers.every((c) => c.status === "completed");
  return allCompleted ? "completed" : "pending";
}

function applyListFilters(assignments, query = {}) {
  const q = String(query.q || "").trim().toLowerCase();
  const status = String(query.status || "all").toLowerCase();
  const fromDate = parseDay(query.from);
  const toDate = parseDay(query.to, true);

  return assignments.filter((assignment) => {
    if (status && status !== "all" && assignment.status !== status) {
      return false;
    }
    if (q) {
      const hay = [
        assignment.blNo,
        assignment.item,
        assignment.exporter,
        assignment.importer,
        assignment.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (fromDate || toDate) {
      const date = assignment.cusdecDate
        ? new Date(assignment.cusdecDate)
        : null;
      if (!date || Number.isNaN(date.getTime())) return false;
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
    }
    return true;
  });
}

async function loadAssignments(query = {}) {
  const rows = await AssignLorry.find({})
    .populate({ path: "createdBy", select: "fullName" })
    .populate({ path: "updatedBy", select: "fullName" })
    .sort({ createdAt: -1 })
    .lean();

  const assignments = rows.map((assignment) => ({
    ...assignment,
    createdBy: nameOf(assignment.createdBy),
    updatedBy: nameOf(assignment.updatedBy),
    status: assignmentStatus(assignment),
  }));

  return applyListFilters(assignments, query);
}

async function buildListExcel(assignments) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RG Business transport";
  const sheet = workbook.addWorksheet("Assignments");

  sheet.columns = [
    { header: "BL Number", key: "blNo", width: 16 },
    { header: "Status", key: "status", width: 14 },
    { header: "Cusdec Date", key: "cusdecDate", width: 14 },
    { header: "Cusdec Number", key: "cusdecNo", width: 16 },
    { header: "Registration No.", key: "regNo", width: 16 },
    { header: "Item", key: "item", width: 18 },
    { header: "Exporter", key: "exporter", width: 18 },
    { header: "Importer", key: "importer", width: 18 },
    { header: "Containers", key: "containerCount", width: 12 },
    { header: "Container Nos", key: "containerNos", width: 28 },
  ];

  assignments.forEach((assignment) => {
    const containers = assignment.containers || [];
    sheet.addRow({
      blNo: assignment.blNo || "",
      status: (assignment.status || "pending").replace(/-/g, " "),
      cusdecDate: formatDate(assignment.cusdecDate),
      cusdecNo: assignment.cusdecNo || "",
      regNo: assignment.regNo || "",
      item: assignment.item || "",
      exporter: assignment.exporter || "",
      importer: assignment.importer || "",
      containerCount: containers.length,
      containerNos: containers
        .map((c) => c.containerNo)
        .filter(Boolean)
        .join(", "),
    });
  });

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1B5A9D" },
  };
  sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };

  return workbook.xlsx.writeBuffer();
}

function buildListPdf(assignments, query = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36, layout: "landscape" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const navy = "#1B5A9D";
    const gold = "#C5CCD4";
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const cols = [
      { key: "blNo", label: "BL Number", width: 90 },
      { key: "cusdecDate", label: "Cusdec Date", width: 80 },
      { key: "item", label: "Item", width: 130 },
      { key: "exporter", label: "Exporter", width: 130 },
      { key: "importer", label: "Importer", width: 120 },
      { key: "containers", label: "Ctns", width: 40 },
      { key: "status", label: "Status", width: 80 },
    ];
    const tableW = cols.reduce((sum, col) => sum + col.width, 0);
    const tableX = 36;

    const drawHeader = () => {
      doc.rect(0, 0, pageW, 70).fill(navy);
      doc.roundedRect(36, 18, 34, 34, 6).fill("#111111");
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(11).text("RG", 36, 29, {
        width: 34,
        align: "center",
      });
      doc.fillColor("#FFFFFF").fontSize(18).text("RG Business transport", 80, 22);
      doc.fillColor(gold).font("Helvetica").fontSize(9).text("LOGISTICS", 80, 44);
      doc.fillColor("#FFFFFF").fontSize(8).text("ASSIGNMENTS", 0, 22, {
        align: "right",
        width: pageW - 36,
      });
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(`${assignments.length} record${assignments.length === 1 ? "" : "s"}`, 0, 38, {
          align: "right",
          width: pageW - 36,
        });
    };

    const filterBits = [
      query.q ? `Search: ${query.q}` : "",
      query.status && query.status !== "all" ? `Status: ${query.status}` : "",
      query.from ? `From: ${formatDate(query.from)}` : "",
      query.to ? `To: ${formatDate(query.to)}` : "",
    ].filter(Boolean);
    const filterLine = filterBits.length ? filterBits.join("  ·  ") : "All assignments";

    const drawTableHead = (y) => {
      doc.rect(tableX, y, tableW, 22).fill(navy);
      let x = tableX;
      cols.forEach((col) => {
        doc
          .fillColor("#FFFFFF")
          .font("Helvetica-Bold")
          .fontSize(8)
          .text(col.label.toUpperCase(), x + 6, y + 7, { width: col.width - 12 });
        x += col.width;
      });
      return y + 22;
    };

    drawHeader();
    doc.fillColor("#667085").font("Helvetica").fontSize(9).text(filterLine, 36, 82);
    let y = drawTableHead(100);

    if (!assignments.length) {
      doc.fillColor("#667085").font("Helvetica").fontSize(10).text("No assignments found.", 36, y + 16);
    }

    assignments.forEach((assignment, index) => {
      if (y > pageH - 48) {
        doc.addPage();
        drawHeader();
        y = drawTableHead(82);
      }
      const rowH = 20;
      if (index % 2 === 0) {
        doc.rect(tableX, y, tableW, rowH).fill("#F7F8FA");
      }
      const values = {
        blNo: assignment.blNo || "—",
        cusdecDate: formatDate(assignment.cusdecDate) || "—",
        item: assignment.item || "—",
        exporter: assignment.exporter || "—",
        importer: assignment.importer || "—",
        containers: String((assignment.containers || []).length),
        status: (assignment.status || "pending").replace(/-/g, " "),
      };
      let x = tableX;
      cols.forEach((col) => {
        doc
          .fillColor(navy)
          .font(col.key === "blNo" ? "Helvetica-Bold" : "Helvetica")
          .fontSize(8)
          .text(String(values[col.key]), x + 6, y + 6, {
            width: col.width - 12,
            ellipsis: true,
          });
        x += col.width;
      });
      y += rowH;
    });

    doc
      .fillColor("#667085")
      .font("Helvetica")
      .fontSize(8)
      .text(
        `Generated ${formatDateTime(new Date().toISOString())}  ·  RG Business transport`,
        36,
        pageH - 28,
        { width: pageW - 72, align: "center" }
      );

    doc.end();
  });
}

exports.exportAssignmentsExcel = async (req, res) => {
  try {
    const assignments = await loadAssignments(req.query);
    const buffer = await buildListExcel(assignments);
    return sendFile(
      res,
      Buffer.from(buffer),
      "RG-Business-transport-Assignments.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to export Excel.",
      error: error.message,
    });
  }
};

exports.exportAssignmentsPdf = async (req, res) => {
  try {
    const assignments = await loadAssignments(req.query);
    const buffer = await buildListPdf(assignments, req.query);
    return sendFile(
      res,
      buffer,
      "RG-Business-transport-Assignments.pdf",
      "application/pdf"
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to export PDF.",
      error: error.message,
    });
  }
};

const moneyCompact = (value) => {
  const amount = Math.round((toAmount(value) + Number.EPSILON) * 100) / 100;
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  return `Rs ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
};

const formatDateDmy = (value) => {
  if (!value) return "—";
  if (typeof value === "string") {
    const part = value.substring(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
      const [year, month, day] = part.split("-");
      return `${day}/${month}/${year}`;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

async function loadSelectedContainerRows(containerIds) {
  const wanted = (Array.isArray(containerIds) ? containerIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const objectIds = wanted
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!objectIds.length) return [];

  const assignments = await AssignLorry.find({
    "containers._id": { $in: objectIds },
  })
    .populate({ path: "containers.destination", select: "location type" })
    .populate({
      path: "containers.lorryId",
      select: "lorryNum capacity owner",
      populate: { path: "owner", select: "ownerName" },
    })
    .lean();

  const rates = await loadHeldUpRates();
  const byId = new Map();
  assignments.forEach((assignment) => {
    applyHeldUpToContainers(assignment.containers || [], rates).forEach((container) => {
      const id = String(container._id);
      if (!wanted.includes(id)) return;
      byId.set(id, {
        assignment: {
          _id: assignment._id,
          blNo: assignment.blNo,
          cusdecDate: assignment.cusdecDate,
          cusdecNo: assignment.cusdecNo,
          regNo: assignment.regNo,
          item: assignment.item,
          exporter: assignment.exporter,
          importer: assignment.importer,
          status: assignmentStatus(assignment),
        },
        container: {
          ...container,
          lorryNum: container.lorryNum || container.lorryId?.lorryNum,
          capacity: container.capacity || container.lorryId?.capacity,
          lorryOwner: container.lorryOwner || container.lorryId?.owner?.ownerName,
          destinationlocation:
            container.destinationlocation || container.destination?.location,
        },
      });
    });
  });

  return wanted.map((id) => byId.get(id)).filter(Boolean);
}

function groupSelectedRows(rows) {
  const groups = [];
  const indexById = new Map();
  rows.forEach((row) => {
    const key = String(row.assignment?._id || row.assignment?.blNo || groups.length);
    const existing = indexById.get(key);
    if (existing === undefined) {
      indexById.set(key, groups.length);
      groups.push({ assignment: row.assignment, containers: [row.container] });
      return;
    }
    groups[existing].containers.push(row.container);
  });
  return groups;
}

function buildSelectedContainersPdf(rows, role) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36, layout: "portrait" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const navy = "#1B5A9D";
    const gold = "#C5CCD4";
    const pageW = doc.page.width;
    const groups = groupSelectedRows(rows);

    const drawHero = () => {
      doc.rect(0, 0, pageW, 78).fill(navy);
      doc.roundedRect(36, 24, 36, 36, 6).fill("#111111");
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(11).text("RG", 36, 36, {
        width: 36,
        align: "center",
      });
      doc.fillColor("#FFFFFF").fontSize(18).text("RG Business transport", 82, 28);
      doc.fillColor(gold).font("Helvetica").fontSize(9).text("LOGISTICS", 82, 50);
      doc.fillColor("#FFFFFF").fontSize(8).text("SELECTED CONTAINERS", 0, 26, {
        align: "right",
        width: pageW - 36,
      });
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(
          `${rows.length} container${rows.length === 1 ? "" : "s"}`,
          0,
          40,
          { align: "right", width: pageW - 36 }
        );
      doc
        .font("Helvetica")
        .fillColor(gold)
        .fontSize(10)
        .text(`${groups.length} BL${groups.length === 1 ? "" : "s"}`, 0, 56, {
          align: "right",
          width: pageW - 36,
        });
    };

    let y = 96;
    const ensure = (need = 120) => {
      if (y + need < 780) return;
      doc.addPage();
      y = 40;
    };

    const section = (title) => {
      ensure(40);
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(10).text(title.toUpperCase(), 36, y);
      doc
        .moveTo(36, y + 14)
        .lineTo(pageW - 36, y + 14)
        .strokeColor(gold)
        .lineWidth(1.5)
        .stroke();
      y += 22;
    };

    const kv = (items) => {
      const colW = (pageW - 72) / 3;
      items.forEach((item, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 36 + col * colW;
        const yy = y + row * 28;
        doc.fillColor("#667085").font("Helvetica").fontSize(8).text(item[0], x, yy);
        doc
          .fillColor(navy)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(String(item[1] ?? "—") || "—", x, yy + 11, { width: colW - 8 });
      });
      y += Math.ceil(items.length / 3) * 28 + 8;
    };

    drawHero();

    groups.forEach((group) => {
      const assignment = group.assignment || {};
      section(`Assignment details · ${assignment.blNo || "—"}`);
      kv([
        ["BL Number", assignment.blNo],
        ["Cusdec Date", formatDateDmy(assignment.cusdecDate)],
        ["Cusdec Number", assignment.cusdecNo],
        ["Registration No.", assignment.regNo],
        ["Item", assignment.item],
        ["Exporter", assignment.exporter],
        ["Importer", assignment.importer],
      ]);

      section(`Containers (${group.containers.length})`);
      group.containers.forEach((c, index) => {
        const tot = containerTotal(c, role);
        const paid = containerPaid(c, role);
        ensure(160);
        doc.roundedRect(36, y, pageW - 72, 18, 3).fill("#F3F4F6");
        doc
          .fillColor(navy)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(`${index + 1}. ${c.containerNo || "—"}`, 42, y + 5);
        doc.font("Helvetica").fontSize(9).text(
          (c.status || "pending").replace(/-/g, " "),
          36,
          y + 5,
          { width: pageW - 84, align: "right" }
        );
        y += 26;
        kv([
          ["VOC No.", c.vocNo],
          ["Lorry", lorryLabel(c)],
          ["Owner", ownerLabel(c)],
          ["Destination", destLabel(c)],
          ["Loading", formatDateDmy(c.loadingDate)],
          ["Demount", formatDateDmy(c.demoundDate)],
          ["FCL Status", formatFclRecord(c.fcl)],
        ]);

        const charges = [
          canSeeField(role, "weight") ? ["Weight", c.weight] : null,
          canSeeField(role, "dayHire") ? ["Day Hire", c.dayHire] : null,
          canSeeField(role, "advanced")
            ? [
                c.advancedDate
                  ? `Advanced (${formatDateDmy(c.advancedDate)})`
                  : "Advanced",
                c.advanced,
              ]
            : null,
          canSeeField(role, "balancePaid")
            ? [
                c.balanceDate
                  ? `Balance Paid (${formatDateDmy(c.balanceDate)})`
                  : "Balance Paid",
                c.balancePaid,
              ]
            : null,
          canSeeField(role, "outHire") ? ["Out Hire", c.outHire] : null,
          canSeeField(role, "other") ? ["Other", c.other] : null,
          canSeeField(role, "heldUp") ? ["Held Up", c.heldUp] : null,
          canSeeField(role, "return") ? ["Return", c.return] : null,
        ].filter(Boolean);

        ensure(Math.ceil(charges.length / 2) * 16 + 50);
        const tableTop = y;
        charges.forEach((row, i) => {
          const col = i % 2;
          const rowI = Math.floor(i / 2);
          const x = 36 + col * ((pageW - 72) / 2);
          const yy = tableTop + rowI * 16;
          doc.fillColor("#667085").font("Helvetica").fontSize(9).text(row[0], x, yy);
          doc
            .fillColor(navy)
            .font("Helvetica-Bold")
            .text(moneyCompact(row[1]), x, yy, {
              width: (pageW - 88) / 2,
              align: "right",
            });
        });
        y = tableTop + Math.ceil((charges.length || 1) / 2) * 16 + 8;

        if (canSeeField(role, "totals")) {
          const boxW = (pageW - 88) / 3;
          [
            ["Total", moneyCompact(tot), false],
            ["Paid", moneyCompact(paid), false],
            ["Balance", moneyCompact(tot - paid), true],
          ].forEach((box, i) => {
            const x = 36 + i * (boxW + 8);
            if (box[2]) doc.roundedRect(x, y, boxW, 28, 3).fill(navy);
            else
              doc
                .roundedRect(x, y, boxW, 28, 3)
                .strokeColor("#D0D5DD")
                .lineWidth(0.6)
                .stroke();
            doc
              .fillColor(box[2] ? "#FFFFFF" : "#667085")
              .font("Helvetica")
              .fontSize(8)
              .text(box[0], x + 8, y + 5);
            doc
              .fillColor(box[2] ? "#FFFFFF" : navy)
              .font("Helvetica-Bold")
              .fontSize(11)
              .text(box[1], x + 8, y + 14);
          });
          y += 42;
        }
      });
    });

    ensure(30);
    doc
      .fillColor("#667085")
      .fontSize(8)
      .text(
        `Generated ${formatDateTime(new Date().toISOString())}  ·  RG Business transport`,
        36,
        y,
        { width: pageW - 72, align: "center" }
      );

    doc.end();
  });
}

exports.exportSelectedContainersPdf = async (req, res) => {
  try {
    const containerIds = Array.isArray(req.body?.containerIds)
      ? req.body.containerIds
      : String(req.query.ids || "")
          .split(",")
          .filter(Boolean);
    if (!containerIds.length) {
      return res.status(400).json({
        success: false,
        message: "Select at least one container.",
      });
    }
    const rows = await loadSelectedContainerRows(containerIds);
    const buffer = await buildSelectedContainersPdf(rows, req.authRole);
    return sendFile(
      res,
      buffer,
      "RG-Business-transport-Containers.pdf",
      "application/pdf"
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to export PDF.",
      error: error.message,
    });
  }
};
