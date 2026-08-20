const mongoose = require("mongoose");

const assignLorrySchema = new mongoose.Schema(
  {
    blNo: {
      type: String,
      required: [true, "BL No. is required."],
      trim: true,
    },
    cusdecDate: {
      type: String,
      required: [true, "Cusdec Date is required."],
      trim: true,
    },
    cusdecNo: {
      type: String,
      required: [true, "Cusdec No. is required."],
      trim: true,
    },
    regNo: {
      type: String,
      required: [true, "Reg No. is required."],
      trim: true,
    },
    item: {
      type: String,
      trim: true,
    },
    exporter: {
      type: String,
      trim: true,
    },
    importer: {
      type: String,
      trim: true,
    },

    containers: [
      {
        status: {
          type: String,
          enum: ["in-progress", "completed", "pending"],
          default: "pending",
        },
        containerNo: {
          type: String,
          required: [true, "Container No. is required."],
          trim: true,
        },
        vocNo: {
          type: String,
          required: [true, "Container No. is required."],
          trim: true,
        },
        lorryId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Lorry",
          required: [true, "Lorry ID is required."],
        },
        loadingDate: {
          type: Date,
          required: [true, "Loading date is required."],
        },
        demoundDate: {
          type: Date,
          required: [true, "demoundDate date is required."],
        },
        destination: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Destination",
        },
        weight: {
          type: Number,
          required: [true, "Weight payment amount is required"],
        },
        dayHire: {
          type: Number,
          required: [true, "Day hire amount is required."],
        },

        outHire: {
          type: Number,
        },
        other: {
          type: Number,
        },
        advanced: {
          type: Number,
          required: [true, "Advanced payment amount is required."],
        },
        advancedDate: {
          type: Date,
          default: Date.now,
        },
        balancePaid: {
          type: Number,
          default: 0,
        },
        balanceDate: {
          type: Date,
        },
        heldUp: {
          type: Number,
        },

        agentFee: {
          type: Number,
        },
        transportCommission: {
          type: Number,
        },
        return: {
          type: Number,
        },

        ot: {
          containerNo: {
            type: String,
            trim: true,
          },
        },
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        createdAt: {
          type: String,
        },
        updatedAt: {
          type: String,
        },
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const AssignLorry =
  mongoose.models.AssignLorry ||
  mongoose.model("AssignLorry", assignLorrySchema);

module.exports = AssignLorry;
