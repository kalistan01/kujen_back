const { Role } = require("../../../models");

exports.addRole = async (req, res) => {
  try {
    const { roleName, permission, denied, status, admin } = req.body;
    Role.create({
      roleName,
      permission,
      denied,
      status,
      admin,
    })
      .then((result) => {
        return res.status(201).send({
          status: 0,
          success: true,
          data: result,
        });
      })
      .catch((e) => {
        return res.status(500).json({
          message: "Something went wrong",
          success: false,
          error: e.message,
        });
      });
  } catch (error) {
    return res.status(500).json({
      message: "Something went wrong",
      success: false,
      error: error.message,
    });
  }
};
exports.findRole = async (req, res) => {
  try {
    Role.find()
      .then((result) => {
        return res.status(200).send({
          success: true,
          data: result,
        });
      })
      .catch((e) => {
        return res.status(500).json({
          message: "Something went wrong",
          success: false,
          error: e.message,
        });
      });
  } catch (error) {
    return res.status(500).json({
      message: "Something went wrong",
      success: false,
      error: error.message,
    });
  }
};
exports.updateRole = async (req, res) => {
  try {
    const { roleName, permission, denied, admin } = req.body;
    const { roleid } = req.headers;

    Role.findByIdAndUpdate(
      { _id: roleid },
      {
        roleName,
        permission,
        denied,
        admin,
      },
      { new: true }
    )
      .then((result) => {
        return res.status(200).send({
          success: true,
          data: result,
        });
      })
      .catch((e) => {
        return res.status(500).json({
          message: "Something went wrong",
          success: false,
          error: e.message,
        });
      });
  } catch (error) {
    return res.status(500).json({
      message: "Something went wrong",
      success: false,
      error: error.message,
    });
  }
};
exports.findRoleId = async (req, res) => {
  try {
    const { roleid } = req.headers;

    Role.findOne({ _id: roleid })
      .then((result) => {
        return res.status(200).send({
          success: true,
          data: result,
        });
      })
      .catch((e) => {
        return res.status(500).json({
          message: "Something went wrong",
          success: false,
          error: e.message,
        });
      });
  } catch (error) {
    return res.status(500).json({
      message: "Something went wrong",
      success: false,
      error: error.message,
    });
  }
};
exports.deactivateRole = async (req, res) => {
  try {
    const { roleid } = req.headers;
    Role.findByIdAndUpdate(
      { _id: roleid },
      {
        status: false,
      },
      { new: true }
    )
      .then((result) => {
        return res.status(200).send({
          success: true,
          data: result,
        });
      })
      .catch((e) => {
        return res.status(500).json({
          message: "Something went wrong",
          success: false,
          error: e.message,
        });
      });
  } catch (error) {
    return res.status(500).json({
      message: "Something went wrong",
      success: false,
      error: error.message,
    });
  }
};
exports.activateRole = async (req, res) => {
  try {
    const { roleid } = req.headers;
    Role.findByIdAndUpdate(
      { _id: roleid },
      {
        status: true,
      },
      { new: true }
    )
      .then((result) => {
        return res.status(200).send({
          success: true,
          data: result,
        });
      })
      .catch((e) => {
        return res.status(500).json({
          message: "Something went wrong",
          success: false,
          error: e.message,
        });
      });
  } catch (error) {
    return res.status(500).json({
      message: "Something went wrong",
      success: false,
      error: error.message,
    });
  }
};
