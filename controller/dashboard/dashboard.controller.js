const {
  Destination,
  LorryOwner,
  AssignLorry,
  ActivityLog,
} = require("../../models");
const User = require("../../models/user.model");

exports.getCounts = async (req, res) => {
  try {
    const [
      lorryOwner,
      distination,
      user,
      assignment,
      activeAssignment,
      recentActivity,
      recentAssignments,
    ] = await Promise.all([
      LorryOwner.countDocuments(),
      Destination.countDocuments(),
      User.countDocuments(),
      AssignLorry.countDocuments(),
      AssignLorry.countDocuments({
        containers: {
          $elemMatch: {
            status: { $in: ["in-progress", "pending"] },
          },
        },
      }),
      ActivityLog.find({})
        .sort({ createdAt: -1 })
        .limit(8)
        .select("action module summary actorName actorRole success createdAt")
        .lean(),
      AssignLorry.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select("blNo item exporter cusdecDate containers createdAt")
        .lean(),
    ]);

    const completedAssignment = Math.max(0, assignment - activeAssignment);

    res.status(200).json({
      success: true,
      count: {
        lorryOwner,
        distination,
        destination: distination,
        user,
        assignment,
        assignent: assignment,
        activeAssignment,
        completedAssignment,
      },
      recentActivity,
      recentAssignments: recentAssignments.map((item) => ({
        _id: item._id,
        blNo: item.blNo,
        item: item.item,
        exporter: item.exporter,
        cusdecDate: item.cusdecDate,
        containers: (item.containers || []).length,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
