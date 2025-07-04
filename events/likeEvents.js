const mongoose = require("mongoose");

//Models
const Feed = require("../models/feed");
const Like = require("../models/like");

const BUFFER_INTERVAL = 2000;
let buffer = {};

const flushBuffer = async () => {
  for (const feedId in buffer) {
    const likeActions = buffer[feedId];
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      for (const { userId } of likeActions) {
        const likeExists = await Like.findOne(
          { user: userId, feed: feedId },
          null,
          { session }
        );

        if (likeExists) {
          await Like.deleteOne({ _id: likeExists._id }, { session });
          await Feed.findByIdAndUpdate(
            feedId,
            { $pull: { likes: userId } },
            { session }
          );
        } else {
          const newLike = new Like({
            user: userId,
            feed: feedId,
          });
          await newLike.save({ session });
          await Feed.findByIdAndUpdate(
            feedId,
            { $push: { likes: userId } },
            { session, new: true }
          );
        }
      }

      await session.commitTransaction();
      console.log(`Transaction committed for feedId: ${feedId}`);
    } catch (error) {
      await session.abortTransaction();
      console.error("Error in flushBuffer:", error);
    } finally {
      session.endSession();
      console.log(`Session ended for feedId: ${feedId}`);
    }
  }

  // Clear the buffer after flushing
  buffer = {};
};

// Periodically flush the buffer
setInterval(flushBuffer, BUFFER_INTERVAL);

module.exports.handleUserLike = async (data) => {
  const { userId, feedId } = data;
  console.log({ userId, feedId });

  if (!buffer[feedId]) buffer[feedId] = [];
  buffer[feedId].push({ userId });
};
