const { Destination, LorryOwner, AssignLorry } = require("../../models");
const User = require("../../models/user.model");

exports.getCounts = async (req, res) => {
  try {
    const lorryOwner = await LorryOwner.countDocuments();
    const distination = await Destination.countDocuments();
    const user = await User.countDocuments();
    const assignent = await AssignLorry.aggregate([
  {
    $match: {
      containers: {
        $elemMatch: {
          status: { $in: ["in-progress", "pending"] }
        }
      }
    }
  },
  {
    $count: "total"
  }
]);
    res.status(200).json({
      success: true,
      count: {
        lorryOwner,
        distination,
        assignent: assignent[0]?.total || 0,
        user,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
