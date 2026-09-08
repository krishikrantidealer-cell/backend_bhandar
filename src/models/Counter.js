const mongoose = require("mongoose");

const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});

const Counter = mongoose.model("Counter", CounterSchema, "counters");

/**
 * Get next sequence number atomically
 * @param {string} counterId Identifier for sequence (e.g. "orderNumber", "customerId")
 * @param {number} defaultStartingValue Initial sequence starting value if not yet initialized
 */
async function getNextSequence(counterId, defaultStartingValue = 1) {
    let counter = await Counter.findById(counterId);

    if (!counter) {
        // Initialize counter starting at defaultStartingValue
        counter = await Counter.findByIdAndUpdate(
            counterId,
            { $setOnInsert: { seq: defaultStartingValue } },
            { returnDocument: 'after', upsert: true }
        );
        return counter.seq;
    }

    // Atomically increment existing sequence
    const updated = await Counter.findByIdAndUpdate(
        counterId,
        { $inc: { seq: 1 } },
        { returnDocument: 'after' }
    );

    return updated.seq;
}

module.exports = { Counter, getNextSequence };
