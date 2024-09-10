import express from 'express';
import * as minio from 'minio';
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config()

const app = express();

const bucketName = 'example-bucket'

let minioClient: minio.Client;

const init = async () => {

  // STORAGE_ENDPOINT, STORAGE_PORT, STORAGE_USER, STORAGE_PASSWORD, STORAGE_USE_SSL are set by Zeabur
  // Once you deploy a MinIO service in the same project with this app,
  // Zeabur will automatically set these environment variables for you.

  let endPoint = process.env.MINIO_HOST
  if (!endPoint) {
    console.info('STORAGE_ENDPOINT is not set. Did you deploy a MinIO service?')
    console.info('If you are running this app locally, you can get the endpoint from the "domain" tab of MinIO service in the Zeabur dashboard.')
    process.exit(1)
  }

  let portStr = '9000'
  if (!portStr) {
    console.info('STORAGE_PORT is not set. Did you deploy a MinIO service?')
    console.info('If you are running this app locally, you can get the port from the "domain" tab of MinIO service in the Zeabur dashboard.')
    process.exit(1)
  }
  const port = parseInt(portStr)

  const accessKey = process.env.MINIO_USERNAME
  if (!accessKey) {
    console.info('STORAGE_USER is not set. Did you deploy a MinIO service?')
    console.info('If you are running this app locally, you can get the access key from the "connect" tab of MinIO service in the Zeabur dashboard.')
    process.exit(1)
  }

  const secretKey = process.env.MINIO_PASSWORD
  if (!secretKey) {
    console.info('STORAGE_PASSWORD is not set. Did you deploy a MinIO service?')
    console.info('If you are running this app locally, you can get the secret key from the "connect" tab of MinIO service in the Zeabur dashboard.')
    process.exit(1)
  }

  const useSSLStr = undefined
  if(useSSLStr === undefined) {
    console.info('STORAGE_USE_SSL is not set. Did you deploy a MinIO service?')
    console.info('If you are running this app locally, you can get the useSSL value from the "connect" tab of MinIO service in the Zeabur dashboard.')
    process.exit(1)
  }
  const useSSL = useSSLStr === 'true'

  // create a MinIO client with credentials from Zeabur
  console.info('Connecting to MinIO storage...')
  minioClient = new minio.Client({endPoint, accessKey, secretKey, port, useSSL})
  console.info('Connected!')

  // check if the bucket exists, if not, create it
  console.info('Checking if bucket exists...')
  const bucketExists = await minioClient.bucketExists(bucketName)
  if (!bucketExists) {
    console.info('Bucket does not exist, creating...')
    await minioClient.makeBucket(bucketName)
    console.info('Bucket created!')
    console.info('Setting bucket policy to allow all read...')
    const policyAllowAllRead = {
      Version: '2012-10-17',
      Id: 'allow-all-read',
      Statement: [
        {
          Action: ['s3:GetObject'],
          Effect: 'Allow',
          Principal: {
            AWS: ['*'],
          },
          Resource: ['arn:aws:s3:::' + bucketName +'/*'],
        },
      ],
    };
    await minioClient.setBucketPolicy(bucketName, JSON.stringify(policyAllowAllRead))
    console.info('Policy set!')
  } else {
    console.info('Bucket exists!')
  }
}

app.get('/', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(`
  <html lang="en-US">
    <head>
      <title>Express MinIO example</title>
    </head>
    <body>
      <h1>Express MinIO example</h1>
      <p>Run following bash command to create a text file:</p>
      <pre>echo "Hello World" > hello.txt</pre>
      <p>Then, run following curl command to upload the file to MinIO storage.</p>
      <pre>curl -X POST -T hello.txt https://minio-demo.zeabur.app/upload</pre> 
    </body>
  </html>
  `)
})

app.post('/upload', async (req, res) => {
  const randomFileName = crypto.randomUUID()
  await minioClient.putObject(bucketName, randomFileName, req)
  res.end('Your file is now available at https://minio-demo.zeabur.app/objects/' + randomFileName + ' !')
})

app.get('/objects/:objectName', async (req, res) => {
  const objectName = req.params.objectName
  const stream = await minioClient.getObject(bucketName, objectName)
  stream.pipe(res)
})

app.get('/objects', async (req, res) => {
  const stream = await minioClient.listObjects(bucketName)
  let objects: minio.BucketItem[] = []
  stream.on('data', (obj) => {
    objects.push(obj)
  })
  stream.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.write(`
    <html lang="en-US">
      <head>
        <title>Express MinIO example</title>
      </head>
      <body>
        <h1>Express MinIO example</h1>
        <p>Here are the files you uploaded:</p>
        <ul>
          ${objects.map(object => `<li><a href="/objects/${object.name}">${object.name}</a></li>`).join('')}
        </ul>
      </body>
    </html>
    `)
    res.end()
  })
  stream.on('error', (err) => {
    console.error(err)
    res.status(500).end('Something went wrong!')
  })
})

const main = async () => {
  await init();
  app.listen(process.env.PORT || 3000 , async () => {
    console.log('Server started on port ' + (process.env.PORT || 3000))
  });
}

main();
