const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { createPresignedPost }           = require('@aws-sdk/s3-presigned-post')
const { getSignedUrl }                  = require('@aws-sdk/s3-request-presigner')
const { GetObjectCommand }              = require('@aws-sdk/client-s3')

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

const BUCKET = process.env.S3_BUCKET_NAME

// Generate presigned POST URL for browser to upload directly to S3
async function getUploadUrl(filename, filetype, filesize) {
  const key = `transfers/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { url, fields } = await createPresignedPost(s3, {
    Bucket:     BUCKET,
    Key:        key,
    Conditions: [
      ['content-length-range', 0, 5 * 1024 * 1024 * 1024], // 5GB max
      ['starts-with', '$Content-Type', '']
    ],
    Fields: {
      'Content-Type': filetype
    },
    Expires: 900 // 15 minutes
  })

  return { url, fields, key }
}

// Generate presigned GET URL for browser to download directly from S3
async function getDownloadUrl(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key:    key
  })
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 }) // 1 hour
  return url
}

// Delete file from S3 (called after transfer complete)
async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

module.exports = { getUploadUrl, getDownloadUrl, deleteFile }