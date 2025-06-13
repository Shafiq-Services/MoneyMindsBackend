const Series = require('../models/series');

// POST /api/series
// Body: { title, description, posterUrl }
const addSeries = async (req, res) => {
  try {
    const { title, description, posterUrl } = req.body;
    if (!title) {
      return res.status(400).json({ status: false, message: 'title is required.' });
    }
    const series = await Series.create({ title, description, posterUrl });
    return res.status(201).json({ status: true, message: 'Series created successfully.', series });
  } catch (err) {
    return res.status(500).json({ status: false, message: 'Failed to create series.', error: err.message });
  }
};

module.exports = { addSeries: addSeries }; 