const { S3Client, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post')
const { getSignedUrl }        = require('@aws-sdk/s3-request-presigner')

const BUCKET = process.env.S3_BUCKET_NAME
const REGION = process.env.AWS_REGION || 'ap-south-1'

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  forcePathStyle: false  // force virtual hosted style
})

async function getUploadUrl(filename, filetype, filesize) {
  const key = `transfers/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { url, fields } = await createPresignedPost(s3, {
    Bucket:     BUCKET,
    Key:        key,
    Conditions: [
      ['content-length-range', 0, 5 * 1024 * 1024 * 1024]
    ],
    Fields: {
      'Content-Type': filetype || 'application/octet-stream'
    },
    Expires: 900
  })

  // Always use virtual-hosted style URL for CORS compatibility
  const virtualUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/`

  console.log('bucket   :', BUCKET)
  console.log('region   :', REGION)
  console.log('upload url:', virtualUrl)
  console.log('key      :', key)

  return { url: virtualUrl, fields, key }
}

async function getDownloadUrl(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key:    key
  })

  const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })

  // Normalize to virtual-hosted style in case SDK returns path style
  const virtualUrl = signedUrl
    .replace(
      `https://s3.${REGION}.amazonaws.com/${BUCKET}/`,
      `https://${BUCKET}.s3.${REGION}.amazonaws.com/`
    )
    .replace(
      `https://s3.amazonaws.com/${BUCKET}/`,
      `https://${BUCKET}.s3.${REGION}.amazonaws.com/`
    )

  return virtualUrl
}

async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

module.exports = { getUploadUrl, getDownloadUrl, deleteFile }