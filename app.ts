import express from 'express';
import * as minio from 'minio';
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config()

const app = express();

let bucketName = `${process.env.MINIO_DEFAULT_BUCKET}`

let minioClient: minio.Client;

const init = async () => {
  try {
    let endPoint = process.env.MINIO_HOST
    if (!endPoint) {
      throw new Error('MINIO_HOST 未設置。您是否部署了 MinIO 服務？')
    }

    const port = 9000

    const accessKey = process.env.MINIO_USERNAME
    if (!accessKey) {
      throw new Error('MINIO_USERNAME 未設置。您是否部署了 MinIO 服務？')
    }

    const secretKey = process.env.MINIO_PASSWORD
    if (!secretKey) {
      throw new Error('MINIO_PASSWORD 未設置。您是否部署了 MinIO 服務？')
    }

    const useSSL = false

    console.info('正在連接到 MinIO 存儲...')
    console.info(`連接詳情：endPoint=${endPoint}, port=${port}, useSSL=${useSSL}`)
    
    minioClient = new minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey
    })

    // 測試連接
    console.info('正在測試 MinIO 連接...')
    await minioClient.listBuckets()
    console.info('成功連接到 MinIO！')

    console.info(`正在檢查 bucket "${bucketName}" 是否存在...`)
    const bucketExists = await minioClient.bucketExists(bucketName)
    
    if (!bucketExists) {
      console.info(`Bucket "${bucketName}" 不存在，正在創建...`)
      await minioClient.makeBucket(bucketName)
      console.info('Bucket 已創建！')
      
      console.info('正在設置 bucket 策略以允許所有讀取...')
      const policyAllowAllRead = {
        Version: '2012-10-17',
        Statement: [
          {
            Action: ['s3:GetObject'],
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      }
      await minioClient.setBucketPolicy(bucketName, JSON.stringify(policyAllowAllRead))
      console.info('策略已設置！')
    } else {
      console.info(`Bucket "${bucketName}" 已存在！`)
    }
  } catch (error) {
    console.error('初始化過程中發生錯誤：', error)
    throw error
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
