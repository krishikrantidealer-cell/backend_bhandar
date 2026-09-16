const { Storage } = require("@google-cloud/storage");
const path = require("path");

const projectId = process.env.GCS_PROJECT_ID;
const bucketName = process.env.GCS_BUCKET_NAME;
const keyFilename = process.env.GCS_KEYFILE_PATH ? path.resolve(process.env.GCS_KEYFILE_PATH) : undefined;

let storage;
try {
    if (keyFilename) {
        storage = new Storage({ projectId, keyFilename });
    } else {
        storage = new Storage({ projectId });
    }
} catch (error) {
    console.error("❌ Failed to initialize Google Cloud Storage client:", error.message);
}

const bucket = storage && bucketName ? storage.bucket(bucketName) : null;

/**
 * Uploads a file buffer to Google Cloud Storage.
 * @param {Buffer} buffer - File content.
 * @param {string} destination - Bucket destination path.
 * @param {string} contentType - MIME type of the file.
 * @returns {Promise<string>} Public URL of the uploaded image.
 */
const uploadToGCS = async (buffer, destination, contentType) => {
    if (!bucket) {
        throw new Error("GCS Bucket is not initialized. Check your credentials.");
    }

    const file = bucket.file(destination);

    // Save buffer to GCS
    await file.save(buffer, {
        metadata: { contentType },
        resumable: false
    });

    // Attempt to make public. If uniform bucket level access is enabled, 
    // this will fail, which is expected. The bucket itself must be configured for public access.
    try {
        await file.makePublic();
    } catch (err) {
        // Log warning but don't fail, as the bucket might have uniform public access policy configured.
        console.log(`ℹ️ [GCS Info] makePublic skipped or failed for ${destination}: ${err.message}`);
    }

    return `https://storage.googleapis.com/${bucketName}/${destination}`;
};

module.exports = {
    storage,
    bucket,
    uploadToGCS
};
