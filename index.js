import dotenv from 'dotenv';
dotenv.config();
import chalk from 'chalk';
import notifier from 'node-notifier'

let lastStatus = {
    text: '',
    emoji: ''
}

async function getCurrentlyPlayingTrack() {
    const url = `http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${process.env.LASTFM_USERNAME}&api_key=${process.env.LASTFM_API_KEY}&format=json`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error('failed to fetch current track');
    }
    const data = await res.json();
    const track = data.recenttracks.track[0];
    if (track['@attr'] && track['@attr'].nowplaying === 'true') {
        return track;
    }
}

async function getTrackInfo(mbid) {
    if (!mbid) return null
    const url = `http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${process.env.LASTFM_API_KEY}&mbid=${mbid}&format=json`;
    const res = await fetch(url);
    if (!res.ok) {
        console.log("here??")
        throw new Error('failed to fetch track info');
    }
    const data = await res.json();
    console.log(data)
    const track = data.track
    return track;
}

async function getSlackStatus() {
    const url = 'https://slack.com/api/users.profile.get';
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${process.env.SLACK_USER_OAUTH_TOKEN}`,
        },
    });
    const data = await res.json();
    if (!data.ok) {
        throw new Error('failed to fetch slack status');
    }
    return {
        statusText: data.profile.status_text,
        statusEmoji: data.profile.status_emoji,
    }
}

async function setSlackStatus(statusText, statusEmoji, statusExpiration) {
    const url = 'https://slack.com/api/users.profile.set';
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SLACK_USER_OAUTH_TOKEN}`,
        },
        body: JSON.stringify({
            profile: {
                status_text: statusText,
                status_emoji: statusEmoji,
                status_expiration: statusExpiration
            }
        })
    });
    if (!res.ok) {
        throw new Error('failed to set slack status');
    }
}

async function main() {
    try {
        const track = await getCurrentlyPlayingTrack();
        if (!track) {
            console.log(chalk.red(`${chalk.red('currently playing: ') + chalk.bgRed.bold.white('Nothing')}`))
            await setSlackStatus('', '');
            lastStatus = { text: '', emoji: '' };
            return;
        }
        console.log(chalk.blue('currently playing: ') + chalk.bgBlue.bold.white(`${track.name} - ${track.artist['#text']}`))
        const statusText = `${track.name} - ${track.artist['#text']}`;
        const statusEmoji = ':disc-spinning:';
        const currentStatus = await getSlackStatus()
        if (lastStatus.text === statusText && lastStatus.emoji === statusEmoji) {
            console.log(chalk.green('skipping status update bc it\'s already up to date'))
            return;
        }
        if (currentStatus.statusEmoji.trim() != '' && currentStatus.statusEmoji.trim() != statusEmoji) {
            console.log(chalk.red('skipping status update bc some other status is already set'))
            lastStatus = { text: '', emoji: '' };
            return;
        }
        console.log(track.mbid)
        const trackInfo = await getTrackInfo(track.mbid)
        const trackDuration = trackInfo ? Number(trackInfo.duration) : 600000
        const statusExpiration = Math.floor((Date.now() + trackDuration)/1000) + 10
        await setSlackStatus(statusText, statusEmoji, statusExpiration);
        notifier.notify({
            title: 'status updated',
            message: statusText,
            sound: false
        })
        console.log(chalk.green('status updated'))
        lastStatus = { text: statusText, emoji: statusEmoji };
    } catch (e) {
        notifier.notify({
            title: 'error occurred',
            message: e,
            sound: true
        })
        console.error(chalk.red('Error occurred:'), e);
    }
}

await main()

setInterval(async () => {
    await main();
}, 15 * 1000)