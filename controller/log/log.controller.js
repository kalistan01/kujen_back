const { ActivityLog, AssignLorry } = require("../../models");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

exports.getLogs = async (req, res) => {
  try {
    const { q, module, from, to } = req.query;
    const filter = {};

    if (module && module !== "all") {
      filter.module = module;
    }
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    if (q && String(q).trim()) {
      const term = String(q).trim();
      filter.$or = [
        { action: { $regex: term, $options: "i" } },
        { summary: { $regex: term, $options: "i" } },
        { actorName: { $regex: term, $options: "i" } },
        { actorEmail: { $regex: term, $options: "i" } },
        { path: { $regex: term, $options: "i" } },
      ];
    }

    const page = Math.max(1, parseInt(String(req.query.page || 1), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || 10), 10) || 10)
    );
    const skip = (page - 1) * limit;

    const total = await ActivityLog.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / limit) || 1);
    const logs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      count: logs.length,
      total,
      page,
      pages,
      limit,
      data: logs,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch logs.",
      error: error.message,
    });
  }
};

exports.getAssignmentLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await AssignLorry.findById(id).select("blNo").lean();
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    const or = [{ entityId: id }, { path: { $regex: id } }];
    if (assignment.blNo) {
      const bl = escapeRegex(assignment.blNo);
      or.push({ summary: { $regex: `BL\\s+${bl}`, $options: "i" } });
      or.push({ "payload.blNo": assignment.blNo });
    }

    const filter = { module: "assignment", $or: or };
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(String(req.query.limit || 10), 10) || 10)
    );
    const skip = (page - 1) * limit;

    const total = await ActivityLog.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / limit) || 1);
    const logs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      count: logs.length,
      total,
      page,
      pages,
      limit,
      data: logs,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch assignment logs.",
      error: error.message,
    });
  }
};
