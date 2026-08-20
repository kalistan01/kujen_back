const { ActivityLog } = require("../../models");

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
