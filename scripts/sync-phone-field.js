const mongoose = require('mongoose');
const User = require('../models/User');

// MongoDB connection - match existing script convention
const MONGO_URI = 'mongodb://localhost:27027/nldb_saas';

async function syncPhoneField() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Find users that have profile.phone but no top-level phone
    const users = await User.find({
      'profile.phone': { $exists: true, $ne: '' },
      $or: [
        { phone: { $exists: false } },
        { phone: null },
        { phone: '' },
      ],
    });

    console.log(`Found ${users.length} users to sync`);

    let updated = 0;
    let skipped = 0;

    for (const user of users) {
      const phoneNumber = user.profile.phone.trim();
      if (!phoneNumber) {
        skipped++;
        continue;
      }

      // Check if this phone number is already taken by another user
      const existing = await User.findOne({ phone: phoneNumber, _id: { $ne: user._id } });
      if (existing) {
        console.log(`SKIP: ${user.userid} - phone ${phoneNumber} already used by ${existing.userid}`);
        skipped++;
        continue;
      }

      user.phone = phoneNumber;
      await user.save({ validateBeforeSave: false });
      console.log(`OK: ${user.userid} -> phone: ${phoneNumber}`);
      updated++;
    }

    console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

syncPhoneField();
