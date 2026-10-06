const mongoose = require("mongoose");

const assignLorrySchema = new mongoose.Schema(
  {
    blNo: {
      type: String,
          required: [true, "BL number is required."],
      trim: true,
    },
    cusdecDate: {
      type: String,
      required: [true, "Cusdec date is required."],
      trim: true,
    },
    fclDueDate: {
      type: String,
      trim: true,
    },
    cusdecNo: {
      type: String,
      required: [true, "Cusdec number is required."],
      trim: true,
    },
    regNo: {
      type: String,
      required: [true, "Registration number is required."],
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
          enum: ["in-progress", "completed", "pending", "advanced"],
          default: "pending",
        },
        containerNo: {
          type: String,
          required: [true, "Container No. is required."],
          trim: true,
        },
        vocNo: {
          type: String,
          required: [true, "VOC number is required."],
          trim: true,
        },
        billNumber: {
          type: String,
          trim: true,
          default: "",
        },
        containerOut: {
          type: String,
          enum: ["RCT", "OUT PASS", "SCAN", "YARD"],
          trim: true,
        },
        lorryId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Lorry",
          required: [true, "Please select a lorry."],
        },
        loadingDate: {
          type: Date,
          required: [true, "Loading date is required."],
        },
        demoundDate: {
          type: Date,
        },
        buyer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Buyer",
        },
        destination: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Destination",
        },
        sourceContainerId: {
          type: mongoose.Schema.Types.ObjectId,
        },
        tripKind: {
          type: String,
          enum: ["yard", "onward"],
        },
        weight: {
          type: Number,
          default: 0,
        },
        receivedWeight: {
          type: Number,
          default: 0,
        },
        declaredWeight: {
          type: Number,
          default: 0,
        },
        dayHire: {
          type: Number,
          default: 0,
        },

        outHire: {
          type: Number,
        },
        other: {
          type: Number,
        },
        advanced: {
          type: Number,
          default: 0,
        },
        advancedDate: {
          type: Date,
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
        note: {
          type: String,
          trim: true,
          default: "",
        },
        fclExtendedDate: {
          type: String,
          trim: true,
        },

        fcl: {
          enabled: {
            type: Boolean,
            default: false,
          },
          received: {
            done: { type: Boolean, default: false },
            date: { type: Date },
          },
          submitted: {
            done: { type: Boolean, default: false },
            date: { type: Date },
          },
          paymentReceived: {
            done: { type: Boolean, default: false },
            date: { type: Date },
          },
        },
        ot: {
          containerNo: {
            type: String,
            trim: true,
          },
        },
        documents: [
          {
            originalName: {
              type: String,
              trim: true,
              default: "",
            },
            mimeType: {
              type: String,
              trim: true,
              required: true,
            },
            size: {
              type: Number,
              required: true,
            },
            storageKey: {
              type: String,
              required: true,
            },
            uploadedAt: {
              type: Date,
              default: Date.now,
            },
            uploadedBy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
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
