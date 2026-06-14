# SoundCloud Service

A microservice responsible for uploading tracks directly to SoundCloud on behalf of artists.

## Overview

This service provides an API to handle audio file uploads to SoundCloud. It ensures that raw audio files are streamed directly to SoundCloud and never stored at rest inside the service. 

It handles the SoundCloud API interactions, including automatic OAuth token refresh if a user's token has expired, ensuring a seamless experience for artists without requiring manual re-authentication.

## Features
- **Direct Uploads**: Streams audio directly to the SoundCloud API (`/tracks` endpoint).
- **Automated Token Refresh**: Automatically attempts to refresh the SoundCloud access token if the API returns a `401 Unauthorized` error during an upload, and retries the upload with the new token.
- **Privacy-First**: Audio files and tokens are handled ephemerally and not logged or stored permanently.

## Environment Variables

See `.env.example` for required environment variables. Key variables include:

- `ECHO_SC_CLIENT_ID`: Your SoundCloud App Client ID
- `ECHO_SC_CLIENT_SECRET`: Your SoundCloud App Client Secret
- `ECHO_SC_ACCESS_TOKEN`: optional server-side SoundCloud access token used when upload metadata does not include one.
- `ECHO_SC_REFRESH_TOKEN`: optional server-side SoundCloud refresh token used to renew expired access tokens.
- `ECHO_SC_MAX_UPLOAD_BYTES`: Max file size limit
- `ECHO_SC_ALLOWED_EXTENSIONS`: Allowed audio formats

## API Endpoints

### `POST /api/soundcloud/upload`
Upload an audio file to SoundCloud.

**Request**: `multipart/form-data`
- `file`: The audio file.
- `metadata`: A JSON string containing upload details:
  ```json
  {
    "title": "Track Name",
    "description": "Optional description",
    "privacy": "private",
    "access_token": "sc-oauth-token",
    "refresh_token": "sc-refresh-token"
  }
  ```

`access_token` and `refresh_token` can be omitted when `ECHO_SC_ACCESS_TOKEN` / `ECHO_SC_REFRESH_TOKEN` are configured on the service.

**Response**: 
```json
{
  "soundcloud_url": "https://soundcloud.com/artist/track",
  "track_id": 123456,
  "permalink": "track-slug",
  "request_id": "req-xyz"
}
```

## Testing

Tests are written using `pytest`. Network calls to SoundCloud are mocked out to avoid hitting the actual API during tests.

```bash
pytest tests/
```
