const mongoose = require("mongoose");


const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: [true, 'Full name is required.'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required.'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/\S+@\S+\.\S+/, 'is invalid']
    },
    status: {
        type: Boolean,
        default: true
    },
    password: {
        type: String,
        required: [true, 'Password is required.'],
        minlength: 6,
        select: false 
    },
    roleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role", 
        required: true
    },
}, { timestamps: true });


const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
