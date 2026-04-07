import imageCompression from 'browser-image-compression'

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024 // 50 MB

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/webp',
}

const AVATAR_OPTIONS = {
  maxSizeMB: 0.3,
  maxWidthOrHeight: 400,
  useWebWorker: true,
  fileType: 'image/webp',
}

export function isVideo(file: File) {
  return file.type.startsWith('video/')
}

/** 投稿画像を圧縮して R2 にアップロードし、公開 URL を返す */
export async function uploadPostImage(file: File, accessToken: string): Promise<string> {
  const compressed = await imageCompression(file, COMPRESSION_OPTIONS)
  return uploadToR2(compressed, 'posts', accessToken)
}

/** 動画をそのまま R2 にアップロードし、公開 URL を返す（圧縮なし） */
export async function uploadVideo(file: File, accessToken: string): Promise<string> {
  if (file.size > VIDEO_MAX_BYTES) throw new Error('動画は50MB以下にしてください')
  return uploadToR2(file, 'posts', accessToken)
}

/** アバター画像を圧縮して R2 にアップロードし、公開 URL を返す */
export async function uploadAvatar(file: File, accessToken: string): Promise<string> {
  const compressed = await imageCompression(file, AVATAR_OPTIONS)
  return uploadToR2(compressed, 'avatars', accessToken)
}

/** リアクション画像を圧縮して R2 にアップロードし、公開 URL を返す */
export async function uploadReactionImage(file: File, accessToken: string): Promise<string> {
  const compressed = await imageCompression(file, AVATAR_OPTIONS)
  return uploadToR2(compressed, 'reactions', accessToken)
}

async function uploadToR2(
  file: Blob | File,
  folder: 'posts' | 'avatars' | 'reactions',
  accessToken: string,
): Promise<string> {
  // 拡張子を MIME タイプから推定
  const mimeToExt: Record<string, string> = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v',
    'video/hevc': 'mov',
  }
  const ext = mimeToExt[file.type] ?? 'bin'

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-upload-url`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ folder, ext, content_type: file.type }),
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? '署名 URL の取得に失敗しました')
  }

  const { upload_url, public_url } = await res.json() as {
    upload_url: string
    public_url: string
  }

  let uploadRes: Response | undefined
  for (let attempt = 1; attempt <= 3; attempt++) {
    uploadRes = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      },
      body: file,
    })
    if (uploadRes.ok) break
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 500))
  }

  if (!uploadRes?.ok) throw new Error('アップロードに失敗しました')

  return public_url
}
