const { S3Client, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { createPresignedPost }  = require('@aws-sdk/s3-presigned-post')
const { getSignedUrl }         = require('@aws-sdk/s3-request-presigner')

const BUCKET = process.env.S3_BUCKET_NAME
const REGION = process.env.AWS_REGION || 'ap-south-1'

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

// Generate presigned POST — browser uploads directly to S3
async function getUploadUrl(filename, filetype, filesize) {
  const key = `transfers/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { url, fields } = await createPresignedPost(s3, {
    Bucket: BUCKET,
    Key:    key,
    Conditions: [
      ['content-length-range', 0, 5 * 1024 * 1024 * 1024],
    ],
    Fields: {
      'Content-Type': filetype || 'application/octet-stream'
    },
    Expires: 900
  })

  console.log('presigned POST url:', url)
  console.log('presigned POST key:', key)

  return { url, fields, key }
}

// Generate presigned GET — browser downloads directly from S3
async function getDownloadUrl(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key:    key
  })
  const url = await getSignedUrl(s3, command, { expiresIn: 3600 })
  return url
}

async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

module.exports = { getUploadUrl, getDownloadUrl, deleteFile }