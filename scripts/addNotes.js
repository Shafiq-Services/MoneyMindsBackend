require('dotenv').config();
const mongoose = require('mongoose');
const Lesson = require('../models/lesson');

// 🔗 Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://offshafiqahmad:moneyminds123%40%24%5E@cluster0.csfr1qq.mongodb.net/moneyminds?retryWrites=true&w=majority&appName=Cluster0', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// 🧠 Generate random contextual notes for each lesson
const generateNotesForLesson = (lessonName) => {
  const notesTemplates = [
    `📚 *Welcome to "${lessonName}"* — This lesson is an essential milestone in your learning journey. It introduces foundational concepts and sets the stage for what’s to come. Take your time to absorb the material, jot down key ideas, and reflect on how this lesson connects with the broader subject. Building strong fundamentals here will greatly enhance your understanding later on.`,

    `🧠 *Deep Dive: "${lessonName}"* — This lesson offers a focused exploration into core principles and frameworks. Engage with the material actively — pause to reflect, ask questions, and consider how each part fits into the bigger picture. Think of this as an opportunity to strengthen both your theoretical base and your confidence.`,

    `🚀 *Skill Builder: "${lessonName}"* — Here’s your chance to level up. This lesson is designed to challenge and refine your understanding. Try to apply what you’re learning in hypothetical or real scenarios. The more actively you engage, the more lasting your knowledge will be. Don’t be afraid to revisit tough concepts — that’s where growth happens.`,

    `🔍 *Detailed Analysis: "${lessonName}"* — In this lesson, attention to detail is key. Look closely at each example, explanation, or model presented. Identify patterns, recurring ideas, or important contrasts. Deep understanding comes not just from seeing what’s taught, but from analyzing why it’s taught that way.`,

    `📝 *Lesson Reflection: "${lessonName}"* — Think of this lesson as both a checkpoint and a catalyst. As you move through it, keep a personal log of “aha” moments or questions that arise. Use this time to synthesize ideas and see how they align with your current understanding. Active reflection helps convert information into lasting insight.`,

    `🎯 *Strategic Insight: "${lessonName}"* — This lesson offers more than just content — it gives you a framework for thinking about the topic strategically. Pay attention to how concepts are introduced and built upon. What’s the bigger picture? How might you apply these ideas in a real-world or interdisciplinary context? Learning with strategy in mind prepares you for flexible problem solving.`,

    `📈 *Applied Learning: "${lessonName}"* — This lesson bridges the gap between theory and practice. As you engage with it, think about how you would implement the ideas in a real scenario — whether it’s a case study, a project, or something from your own experience. Applied learning makes abstract concepts stick.`,

    `💪 *Challenge Accepted: "${lessonName}"* — This lesson might push you outside your comfort zone — and that’s a sign of meaningful learning. Embrace the complexity, wrestle with the content, and seek clarity through repetition, discussion, or experimentation. Remember, struggle is often the first step toward mastery.`,

    `🧰 *Tools for Success: "${lessonName}"* — Think of this lesson as a toolkit. It may introduce models, techniques, or approaches you’ll use again and again. Try to identify which ideas resonate most, and how you might adapt them for different situations. Make this lesson your own by creating reference notes or examples you can return to.`,

    `📖 *Big Picture Thinking: "${lessonName}"* — As you progress through this lesson, zoom out from time to time. How does this content shape your understanding of the subject as a whole? What connections can you draw to previous lessons? Developing a big-picture mindset will help you retain knowledge and adapt it effectively moving forward.`
  ];

  const randomIndex = Math.floor(Math.random() * notesTemplates.length);
  return notesTemplates[randomIndex];
};

// 🛠 Add/update notes for all lessons
const updateAllLessonsWithNotes = async () => {
  try {
    console.log('🔍 Fetching all lessons...');

    const lessons = await Lesson.find({});
    console.log(`📚 Found ${lessons.length} total lessons.`);

    if (lessons.length === 0) {
      console.log('⚠️ No lessons found.');
      return;
    }

    console.log('📝 Generating and updating notes for every lesson...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const lesson of lessons) {
      try {
        const notes = generateNotesForLesson(lesson.name);

        await Lesson.updateOne(
          { _id: lesson._id },
          { $set: { notes } }
        );

        console.log(`✅ Updated: "${lesson.name}"`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to update "${lesson.name}":`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`✅ Successfully updated: ${successCount}`);
    console.log(`❌ Failed to update: ${errorCount}`);
    console.log(`📦 Total processed: ${lessons.length}`);
  } catch (error) {
    console.error('❌ Error updating lessons:', error);
  }
};

// 🚀 Run script
const runScript = async () => {
  await connectDB();
  await updateAllLessonsWithNotes();

  console.log('\n🔒 Closing MongoDB connection...');
  await mongoose.connection.close();
  console.log('✅ Connection closed. Done.');
  process.exit(0);
};

runScript().catch(error => {
  console.error('❌ Script execution failed:', error);
  process.exit(1);
});
