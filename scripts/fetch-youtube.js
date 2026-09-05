const fs = require('fs');
const path = require('path');

// ⚠️ Your actual API key
const API_KEY = 'AIzaSyBIWm0A_MEffFfVpuGTdkopkaOo4ppPz5g'; 
const CHANNEL_ID = 'UC_DHq9eu17O5QFfVvne1Htg';

async function fetchAllVideos() {
    console.log('🔍 Starting full YouTube sync...');
    let allVideos = [];
    let nextPageToken = '';
    
    // 1. Get the Uploads playlist ID
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`;
    const channelRes = await fetch(channelUrl);
    const channelData = await channelRes.json();
    
    if (!channelData.items || channelData.items.length === 0) {
        console.log('❌ Could not find channel! Check your API key or Channel ID.');
        return;
    }

    const playlistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
    console.log(`📂 Uploads playlist ID: ${playlistId}`);

    // 2. Fetch ALL playlist items
    do {
        let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${API_KEY}`;
        if (nextPageToken) url += `&pageToken=${nextPageToken}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        allVideos = allVideos.concat(data.items);
        nextPageToken = data.nextPageToken || '';
        
        console.log(`📦 Fetched ${allVideos.length} videos so far...`);
    } while (nextPageToken);

    console.log(`✅ Found ${allVideos.length} total videos in playlist`);

    // 3. Get ALL video IDs
    const videoIds = allVideos.map(item => item.snippet.resourceId.videoId);
    
    // 4. Fetch video details IN CHUNKS OF 50 (because API limits to 50 per request)
    let videoDataItems = [];
    for (let i = 0; i < videoIds.length; i += 50) {
        const chunk = videoIds.slice(i, i + 50).join(',');
        const videoRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${chunk}&key=${API_KEY}`);
        const videoData = await videoRes.json();
        if (videoData.items) {
            videoDataItems = videoDataItems.concat(videoData.items);
        }
        console.log(`✅ Fetched details for ${videoDataItems.length} videos so far...`);
    }
    
    console.log(`✅ Received details for ${videoDataItems.length} videos`);

    // 5. Create the final JSON structure (FIXED the duration logic)
    const finalVideos = videoDataItems.map(item => {
        const durationSeconds = item.contentDetails ? parseDuration(item.contentDetails.duration) : 0;
        return {
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description || '',
            thumbnail: item.snippet.thumbnails.high.url,
            publishedAt: item.snippet.publishedAt,
            duration: item.contentDetails ? item.contentDetails.duration : '',
            durationSeconds: durationSeconds,
            type: durationSeconds < 60 ? 'short' : 'video', // ✅ 60 seconds or more is a Video
            isShort: durationSeconds < 60,
            isLive: item.snippet.liveBroadcastContent === 'live',
            channelId: item.snippet.channelId,
            channelTitle: item.snippet.channelTitle,
            // ⭐ THE VIEW COUNT LINE ⭐
            viewCount: item.statistics ? item.statistics.viewCount : 0
        };
    });

    // 6. Save to file
    const outputPath = path.join(__dirname, '..', 'data', 'youtube.json');
    const jsonData = {
        lastUpdated: new Date().toISOString(),
        totalVideos: finalVideos.length,
        videos: finalVideos
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2));
    console.log(`✅ Saved ${finalVideos.length} videos to data/youtube.json`);
    
    // 7. Print breakdown
    const shorts = finalVideos.filter(v => v.type === 'short').length;
    const videos = finalVideos.filter(v => v.type === 'video').length;
    const live = finalVideos.filter(v => v.isLive).length;
    
    console.log('📊 Types breakdown:');
    console.log(`  - Shorts: ${shorts}`);
    console.log(`  - Videos: ${videos}`);
    console.log(`  - Live: ${live}`);
}

function parseDuration(isoDuration) {
    const matches = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = (matches[1] || '').replace('H', '') || 0;
    const minutes = (matches[2] || '').replace('M', '') || 0;
    const seconds = (matches[3] || '').replace('S', '') || 0;
    return (parseInt(hours) * 3600) + (parseInt(minutes) * 60) + parseInt(seconds);
}

// Run the function
fetchAllVideos().catch(error => {
    console.error('❌ Fatal error:', error);
});