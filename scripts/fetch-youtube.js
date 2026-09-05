const fs = require('fs');
const path = require('path');
const https = require('https');

// YouTube API configuration
const API_KEY = 'AIzaSyBIWm0A_MEffFfVpuGTdkopkaOo4ppPz5g';  // <--- REPLACE THIS WITH YOUR KEY
const CHANNEL_ID = 'UC_DHq9eu17O5QFfVvne1Htg';
const MAX_RESULTS = 50;

function parseDuration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const hours = parseInt(match[1] || 0) * 3600;
  const minutes = parseInt(match[2] || 0) * 60;
  const seconds = parseInt(match[3] || 0);
  return hours + minutes + seconds;
}

function fetchYouTubeData(endpoint, params = '') {
  return new Promise((resolve, reject) => {
    const url = `https://www.googleapis.com/youtube/v3/${endpoint}?key=${API_KEY}&${params}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message));
            return;
          }
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchAllVideos(playlistId, pageToken = '') {
  let allItems = [];
  let nextPageToken = pageToken;

  while (true) {
    const params = `playlistId=${playlistId}&part=snippet,contentDetails&maxResults=${MAX_RESULTS}` +
      (nextPageToken ? `&pageToken=${nextPageToken}` : '');

    const response = await fetchYouTubeData('playlistItems', params);

    if (response.items && response.items.length > 0) {
      allItems = allItems.concat(response.items);
    }

    nextPageToken = response.nextPageToken || null;
    if (!nextPageToken) break;

    console.log(`📦 Fetched ${allItems.length} videos so far...`);
  }

  return allItems;
}

async function syncYouTubeData() {
  try {
    console.log('🔍 Starting full YouTube sync...');

    const channelResponse = await fetchYouTubeData(
      'channels',
      `id=${CHANNEL_ID}&part=contentDetails`
    );

    if (!channelResponse.items || channelResponse.items.length === 0) {
      throw new Error('Channel not found.');
    }

    const uploadsPlaylistId = channelResponse.items[0].contentDetails.relatedPlaylists.uploads;
    console.log(`📂 Uploads playlist ID: ${uploadsPlaylistId}`);

    console.log('⏳ Fetching ALL videos...');
    const allPlaylistItems = await fetchAllVideos(uploadsPlaylistId);

    console.log(`✅ Found ${allPlaylistItems.length} total videos in playlist`);

    if (allPlaylistItems.length === 0) {
      throw new Error('No videos found.');
    }

    const videoIds = allPlaylistItems
      .map(item => item.contentDetails?.videoId)
      .filter(id => id)
      .join(',');

    const videoIdChunks = [];
    const ids = videoIds.split(',');
    for (let i = 0; i < ids.length; i += 50) {
      videoIdChunks.push(ids.slice(i, i + 50).join(','));
    }

    let allVideoDetails = [];
    for (const chunk of videoIdChunks) {
      const response = await fetchYouTubeData(
        'videos',
        `id=${chunk}&part=contentDetails,snippet,liveStreamingDetails`
      );
      if (response.items) {
        allVideoDetails = allVideoDetails.concat(response.items);
      }
    }

    console.log(`✅ Received details for ${allVideoDetails.length} videos`);

    const videos = allVideoDetails
      .filter(item => item && item.contentDetails && item.contentDetails.duration)
      .map(item => {
        try {
          const durationSeconds = parseDuration(item.contentDetails.duration);
          const isShort = durationSeconds < 60;
          const isLive = item.snippet?.liveBroadcastContent === 'live' ||
                         item.snippet?.liveBroadcastContent === 'upcoming';

          return {
            id: item.id || 'unknown',
            title: item.snippet?.title || 'Untitled',
            description: item.snippet?.description || '',
            thumbnail: item.snippet?.thumbnails?.high?.url || '',
            publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
                viewCount: video.statistics ? video.statistics.viewCount : 0,
            duration: item.contentDetails.duration || 'PT0S',
            durationSeconds: durationSeconds,
            type: isShort ? 'short' : isLive ? 'live' : 'video',
            isShort: isShort,
            isLive: isLive,
            channelId: item.snippet?.channelId || '',
            channelTitle: item.snippet?.channelTitle || ''
          };
        } catch (e) {
          console.warn('⚠️ Skipping a video due to error:', e.message);
          return null;
        }
      })
      .filter(item => item !== null);

    console.log(`✅ Processed ${videos.length} valid videos`);

    const dataPath = path.join(__dirname, '../data/youtube.json');
    const output = {
      lastUpdated: new Date().toISOString(),
      totalVideos: videos.length,
      videos: videos
    };

    const dataDir = path.dirname(dataPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(dataPath, JSON.stringify(output, null, 2));
    console.log(`✅ Saved ${videos.length} videos to data/youtube.json`);
    console.log('📊 Types breakdown:');
    console.log(`  - Shorts: ${videos.filter(v => v.type === 'short').length}`);
    console.log(`  - Videos: ${videos.filter(v => v.type === 'video').length}`);
    console.log(`  - Live: ${videos.filter(v => v.type === 'live').length}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

syncYouTubeData();