const mongoose = require("mongoose");


const destinationSchema = new mongoose.Schema({
    type: {
        type: String,
        required: [true, 'Type is required.'],
        enum: ['Port', 'Yard', 'Store', 'RCT', 'Other'],
    },
    location: {
        type: String,
        required: [true, 'Location is required.'],
        trim: true
    },
    status: {
        type: Boolean,
        default: true
    }

}, { timestamps: true });

const Destination = mongoose.models.Destination || mongoose.model('Destination', destinationSchema);

module.exports = Destination;
