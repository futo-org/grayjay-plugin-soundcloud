//* Constants
const API_URL = 'https://api-v2.soundcloud.com/'
const APP_LOCALE = 'en'
const PLATFORM = 'Soundcloud'
const PLATFORM_CLAIMTYPE = 16;
const SOUNDCLOUD_APP_VERSION = '1743501477'
const USER_AGENT_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
const USER_AGENT_MOBILE = 'Mozilla/5.0 (Linux; Android 10; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'

const URL_BASE = "https://soundcloud.com";

let CLIENT_ID = 'BizZxLUFle6OLJ9qji8QOBL8ndasTmdg' // correct as of April 2025, enable changes this to get the latest
const URL_ADDITIVE = `&app_version=${SOUNDCLOUD_APP_VERSION}&app_locale=${APP_LOCALE}`

const REGEX_CHANNEL_PLAYLISTS = /^https?:\/\/(www\.|m\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/sets\/[a-zA-Z0-9_-]+(\?[^#]*)?$/;
const REGEX_SYSTEM_PLAYLISTS = /^https?:\/\/(www\.|m\.)?soundcloud\.com\/[a-zA-Z0-9_-]+\/(likes|popular-tracks|toptracks|tracks|reposts)$/
const REGEX_CHANNEL = /^https?:\/\/(www\.|m\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/?$/;
const REGEX_TRACK = /(?:https?:\/\/)?(?:www\.|m\.)?soundcloud\.com\/[a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+(?:\?[^\s#]*)?/;

const systemPlaylistsMaps = {
    likes: {
        path: 'likes',
        apiPath: 'likes',
        playlistTitle: 'Likes'
    },
    tracks: {
        path: 'tracks',
        apiPath: 'tracks',
        playlistTitle: 'Tracks'
    },
    "popular-tracks": {
        path: "popular-tracks",
        apiPath: 'toptracks',
        playlistTitle: 'Popular Tracks'
    },
    "reposts": {
        path: "reposts",
        apiPath: 'reposts',
        apiBasePath: 'https://api-v2.soundcloud.com/stream/users',
        playlistTitle: 'Reposts'
    },
}

let config = {}

let state = {
    channel: {}
}

let _settings = {
    hidePremiumContent: true
}

//* Source
source.enable = function (conf, settings, saveStateStr) {
    config = conf ?? {}
    _settings = settings ?? {}

    if(IS_TESTING) {
        _settings = {
            hidePremiumContent: true
        }
    }

    
    CLIENT_ID = getClientId()

    try {
        if (saveStateStr) {
            state = JSON.parse(saveStateStr);
        }
    } catch (ex) {
        log('Failed to parse saveState:' + ex);
    }

    return CLIENT_ID
}
source.getHome = function () {
    return new QueryPager({ page: 1, page_size: 20 })
}
source.searchSuggestions = function (query) {
    const url = `${API_URL}search/queries?q=${query}&client_id=${CLIENT_ID}&limit=10&offset=0&linked_partitioning=1${URL_ADDITIVE}`

    const resp = callUrl(url)

    /** @type {import("./types").SearchAutofillResponse} */
    const json = JSON.parse(resp.body)

    if (!json['collection']) {
        throw new ScriptException('Could not find collection')
    }

    /** @type {{output: string; query: string}[]} */
    const collection = json['collection']

    return collection.map((item) => item['query'])
}
source.getSearchCapabilities = () => {
    return {
        types: [Type.Feed.Mixed], // can also do albums, playlists, channels those do not have types yet
        sorts: [],
        filters: [], // filters depend on type
    }
}
source.search = function (query, type, order, filters) {
    return new SearchPagerVideos({ q: query, page: 1, page_size: 20, get_all: false })
}
source.getSearchChannelContentsCapabilities = function () {
    return {
        types: [Type.Feed.Mixed],
        sorts: [Type.Order.Chronological],
        filters: [],
    }
}
source.searchChannelContent = function (channelUrl, query, type, order, filters) {
    return []
}
source.searchChannels = function (query) {
    return new SearchPagerChannels({ q: query, page: 1, page_size: 20 })
}
source.isChannelUrl = function (url) {
    // see if it matches https://soundcloud.com/nfrealmusic
    return !source.isPlaylistUrl(url) && REGEX_CHANNEL.test(url)
}
source.getChannel = function (url) {

    if(state.channel[url]) {
        return state.channel[url];
    }

    const resp = callUrl(url)

    const html = resp.body

    const matched = html.match(/window\.__sc_hydration = (.+);/)
    if (!matched) {
        throw new ScriptException('Could not find channel info')
    }

    /** @type {import("./types").SCHydration[]} */
    const json = JSON.parse(matched[1])

    for (let object of json) {
        if (object.hydratable === 'user') {
            state.channel[url] = soundcloudUserToPlatformChannel(object.data);
            return state.channel[url];
        }
    }

    throw new ScriptException('Could not find channel info')
}
source.getChannelContents = function (url) {
    return new ChannelVideoPager({ url: url, page_size: 20, offset_date: 0 })
}

source.getChannelPlaylists = (url) => {

    const channelSlug = extractSoundCloudId(url);
    
    const channel = source.getChannel(`${URL_BASE}/${channelSlug}`);

    const author =  new PlatformAuthorLink(
        new PlatformID(PLATFORM,channel.id.value.toString(),config.id,PLATFORM_CLAIMTYPE),
        channel.name,
        channel.url,
        channel.thumbnail,
    );

    class ChannelPlaylistsPager extends ContentPager {
        constructor({
            results = [],
            hasMore = true,
            context = {withNext: []},
          }) {
            
            super(results, hasMore, context);
          }

          nextPage() {
              
            let withNext = this.context.withNext ?? [];
            let firstPage = this.context.firstPage ?? false;
            
            let all = firstPage ? (this.results ?? []) : [];

            let batch = http.batch();
            
            withNext.forEach(url => {
                batch.GET(url, {});
            });

            const responses = batch.execute();
        
            withNext = [];
        
            for(var ct = 0; ct < responses.length; ct++) {
                const res = responses[ct];
                
                if(res.isOk) {
                    const body = JSON.parse(res.body);
                    
                    if(body.next_href) {
                        withNext.push(`${body.next_href}$?client_id=${CLIENT_ID}`);
                    }
        
                    const currentCollection = body.collection.map(v => {
                        
                        return new PlatformPlaylist({
                            id: new PlatformID(PLATFORM, v.id.toString(), config.id, PLATFORM_CLAIMTYPE),
                            author: author,
                            name: v.title,
                            thumbnail: v.artwork_url,
                            videoCount: v?.track_count ?? -1,
                            datetime: dateToUnixSeconds(v.display_date),
                            url: v.permalink_url,
                          })
                    });            
        
                    all = [...all, ...currentCollection]
                    
                }
                
            }
        
            const hasMore = !!withNext.length;
            
            return new ChannelPlaylistsPager({results: all, hasMore, context: { withNext }});
          }
    }

    let withNext = [
        `albums`,
        `playlists_without_albums`
    ].map((path) => `https://api-v2.soundcloud.com/users/${channel.id.value}/${path}?client_id=${CLIENT_ID}&limit=10&offset=0&linked_partitioning=1&app_version=${SOUNDCLOUD_APP_VERSION}&app_locale=en`);

// system playlists
    let results = [
        'likes',
        'popular-tracks',
        'tracks',
        'reposts'
    ].map(path => {

        const info = systemPlaylistsMaps[path];

        const name = info?.playlistTitle ?? path;
        const playlistPath = info?.path ?? path;

        return new PlatformPlaylist({
            id: new PlatformID(PLATFORM, '', config.id, PLATFORM_CLAIMTYPE),
            author: author,
            name: name,
            thumbnail: channel.banner || channel.thumbnail || '',
            videoCount: -1,
            // datetime: dateToUnixSeconds(v.display_date),
            url: `https://soundcloud.com/${channelSlug}/${playlistPath}`,
          })
    })

    return new ChannelPlaylistsPager({ results, context: { withNext, firstPage: true } }).nextPage();

}


source.getChannelTemplateByClaimMap = () => {
    return {
        //SoundCloud
        17: {
            0: URL_BASE + "/{{CLAIMVALUE}}"
            //Unused! 1: https://api.soundcloud.com/users/{{CLAIMVALUE}}
        }
    };
};


source.isContentDetailsUrl = function (url) {
    // https://soundcloud.com/toosii2x/toosii-favorite-song
    return !source.isPlaylistUrl(url) && REGEX_TRACK.test(url)
}
source.getContentDetails = function (url) {
    const resp = callUrl(url)

    const html = resp.body

    const matched = html.match(/window\.__sc_hydration = (.+);/)
    if (!matched) {
        if(IS_TESTING)
            console.log(html);
        throw new ScriptException('Could not find video info')
    }
    
    /** @type {SCHydration[]} */
    const json = JSON.parse(matched[1])

    /** @type {import("./types").SoundcloudTrack} */
    let data
    /** @type {import("./types").SoundcloudTrack} */
    let sct

    for (let object of json) {
        if (object.hydratable === 'sound') {
            data = object.data
            sct = soundcloudTrackToPlatformVideo(data)
            break
        }
    }

    if (data.media.transcodings?.length === 0) throw new ScriptException('Could not find transcodings')
    
    const transcoding = data.media.transcodings.find((transcoding) => (transcoding.format.protocol == 'hls'));
    
    if(!transcoding) {
        throw new UnavailableException("No playable sources were found.");
    }

    const parsedTranscodingUrl = new URL(transcoding.url);
    // Private track URLs already contain a "secret_token" query param.
    // Previous version incorrectly added new params using "?" instead of "&",
    // resulting in invalid URLs like "example.com?secret_token=xyz?param=value which returned an error from the SoundCloud API.
    parsedTranscodingUrl.searchParams.append('client_id', CLIENT_ID);
    parsedTranscodingUrl.searchParams.append('track_authorization', data.track_authorization);

    const generated_url = parsedTranscodingUrl.toString();

    const hls_resp = callUrl(generated_url)
    const hls_url = JSON.parse(hls_resp.body).url

    const sources = [
        new HLSSource({
            name: `${transcoding.format.mime_type} ${transcoding?.quality ?? ''}`,
            duration: transcoding.duration,
            url: hls_url,
            language: "Unknown",
            container: transcoding.format.mime_type
        }),
    ]

    sct.video = new UnMuxVideoSourceDescriptor([], sources)
    sct.description = data.description
    const likesCount = Number.isFinite(data?.likes_count) ? data.likes_count : 0;
    sct.rating = new RatingLikes(likesCount);

    sct.getContentRecommendations = function() {
        return source.getContentRecommendations(url);
    }

    return new PlatformVideoDetails(sct)
}

source.getContentRecommendations = function(url) {

    const trackId = extractTrackId(url);
    if (!trackId) {
        return new ContentPager([], false);
    }

    const resp = callUrl(`${API_URL}tracks/${trackId}/related?client_id=${CLIENT_ID}&limit=20&offset=0&linked_partitioning=1${URL_ADDITIVE}`);
    if (!resp.isOk) {
        return new ContentPager([], false);
    }
    
    const json = JSON.parse(resp.body);
    const collection = json.collection || [];
    
    const videos = collection.map(track => soundcloudTrackToPlatformVideo(track));
    
    return new RelatedTracksPager({
        videos,
        hasMore: !!json.next_href,
        nextUrl: json.next_href
    });
};

source.getComments = function (url) {
    return new ExtendableCommentPager({ url: url, page: 1, page_size: 20 })
}
// not in Soundcloud
source.getSubComments = function (comment) {
    return new CommentPager([], false, {})
}
source.getUserSubscriptions = function () {
    const following_resp = callUrl('https://soundcloud.com/you/following', true)
    const html = following_resp.body
    if(IS_TESTING)
        console.log(html)
    const matched = html.match(/window\.__sc_hydration = (.+);/)
    if (!matched) throw new ScriptException('Could not find user info')
    /** @type {SCHydration[]} */
    const following_json = JSON.parse(matched[1])
    let id
    for (let object of following_json) {
        if (object.hydratable === 'meUser') {
            id = object.data.id
            break
        }
    }
    if (!id) throw new ScriptException('Could not find user info')

    const resp = callUrl(`${API_URL}users/${id}/followings?client_id=${CLIENT_ID}&limit=12&offset=0&linked_partitioning=1${URL_ADDITIVE}}`, true)

    const json = JSON.parse(resp.body)

    /** @type {import("./types.d.ts").SoundcloudUser[]} */
    const users = json.collection

    return users.map((user) => user.permalink_url)
}
source.getUserPlaylists = function () {
    const url = `${API_URL}me/library/all?client_id=${CLIENT_ID}&limit=10&offset=0&linked_partioning=1${URL_ADDITIVE}`

    const resp = callUrl(url, true)

    if(IS_TESTING) {
        console.log(url)
        console.log(resp.body)
    }
    const json = JSON.parse(resp.body)

    if(IS_TESTING)
        console.log(json)

    /** @type {import("./types.d.ts").PlaylistWrapper[]} */
    const playlists = json.collection

    return playlists.map((playlist) => {
        if ('playlist' in playlist) {
            return playlist.playlist.permalink_url
        } else if ('system_playlist' in playlist) {
            return playlist.system_playlist.permalink_url
        }
    })
}
source.isPlaylistUrl = function (url) {
    return isSoundCloudChannelPlaylistUrl(url)
}
source.getPlaylist = function (url) {  

    if(isSoundCloudSystemPlaylist(url)){
        return standardPlaylistPager(url);
    }
    
    const resp = callUrl(url, true)

    const html = resp.body

    const matched = html.match(/window\.__sc_hydration = (.+);/)

    if (!matched) {
        throw new ScriptException('Could not find playlist info')
    }

    /** @type {SCHydration[]} */
    const json = JSON.parse(matched[1])
    
    /** @type {number[]} */
    let ids = []
    let playlistTitle = '';
    let playlistId = '';

    for (let object of json) {
        if (object.hydratable === 'systemPlaylist') {
            ids = object.data.tracks.map((track) => track.id) 
            break
        } else if (object.hydratable === 'playlist') {
            ids = object.data.tracks.map((track) => track.id)
            playlistTitle = object.data.title
            playlistId = object.data.id.toString()     
            break
        }
    }

    let user = json.find(object => object.hydratable === 'user');
    
    let author;

    if(user) {
        author =  new PlatformAuthorLink(
            new PlatformID(
              PLATFORM,
              user.data.id.toString(),
              config.id,
              PLATFORM_CLAIMTYPE,
            ),
            user.data.username,
            user.data.permalink_url,
            user.data.avatar_url,
          );
    } else {
        author =  new PlatformAuthorLink(
            new PlatformID(
                PLATFORM,
                '',
                config.id,
                PLATFORM_CLAIMTYPE,
            ),
            '',
            '',
            '',
          );
    }
    
    /** @type {import("./types.d.ts").SoundcloudTrack[]} */
    let tracks = []

    // split ids into chunks of 50
    for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50)

        const generated_url = `${API_URL}tracks?ids=${chunk.join(',')}&client_id=${CLIENT_ID}${URL_ADDITIVE}`
        const chunk_resp = callUrl(generated_url, true)
        const found_tracks = JSON.parse(chunk_resp.body)

        tracks = tracks.concat(found_tracks)
    }
    
    const content = tracks.map(soundcloudTrackToPlatformVideo);
    
    return new PlatformPlaylistDetails({
        url: url,
        id: new PlatformID(PLATFORM, playlistId, config.id),
        author: author,
        name: playlistTitle,
        videoCount: content?.length ?? 0,
        contents: new VideoPager(content)
    });

}

source.saveState = () => {
    return JSON.stringify(state);
};

//* Internals
/**
 * Gets the URL with correct headers
 * @param {string} url
 * @param {boolean} is_authenticated
 * @param {boolean} use_mobile
 * @returns {HTTPResponse}
 */
function callUrl(url, is_authenticated = false, use_mobile = false) {
    
    if(!use_mobile) {
        url = removeMobilePrefix(url);
    }
    
    let headers = {
        'User-Agent': use_mobile ? USER_AGENT_MOBILE : USER_AGENT_DESKTOP,
        DNT: '1',
        Connection: 'keep-alive',
        Origin: 'https://soundcloud.com',
        Referer: 'https://soundcloud.com/',
    }

    let accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'

    if (url.includes('api-v2.soundcloud.com')) {
        accept = 'application/json, text/javascript, */*; q=0.01'
        headers['Host'] = 'api-v2.soundcloud.com'
        headers['SEC-FETCH-DEST'] = 'empty'
        headers['SEC-FETCH-MODE'] = 'cors'
        headers['SEC-FETCH-SITE'] = 'same-site'
    } else {
        headers['SEC-FETCH-DEST'] = 'document'
        headers['SEC-FETCH-MODE'] = 'navigate'
        headers['SEC-FETCH-SITE'] = 'none'
    }

    headers['Accept'] = accept

    return http.GET(url, headers, is_authenticated)
}

/**
 * Gets the client_id from the Soundcloud home page
 * @returns {string} returns the client_id
 */
function getClientId() {
    // request soundcloud.com to find the url of the js file that contains 50-_____.js
    const resp = callUrl('https://soundcloud.com/discover', false, true)
    const html = resp.body

    // find "clientId":"iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX"
    const matched = html.match(/"clientId":"([a-zA-Z0-9-_]+)"/)

    if (!matched) {
        throw new ScriptException('Could not find client_id')
    }

    const clientId = matched[1]

    return clientId
}

/**
 * Gets the Soundcloud homepage content
 * @param {import("./types").HomeContext} context the search context
 * @returns {PlatformVideo[]} returns the homepage content
 */
function getHomepageContent(context) {
    const limit = context.page_size
    const offset = (context.page - 1) * limit
    const url = `${API_URL}featured_tracks/top/all-music?client_id=${CLIENT_ID}&limit=${limit}&offset=${offset}&linked_partitioning=1${URL_ADDITIVE}`

    const resp = callUrl(url)

    if (!resp.isOk) {
        return source.getPlaylist("https://soundcloud.com/soundcloud/sets/tracks-of-the-week").contents
    }

    /** @type {import("./types").HomepageResponse} */
    const json = JSON.parse(resp.body)

    /** @type {import("./types").SoundcloudTrack[]} */
    const tracks = json['collection']

    const results = ensureUniqueByProperty(tracks, 'id')
    .map((track) => {
        return soundcloudTrackToPlatformVideo(track)
    });

    const hasMore = json?.['next_href'] !== null

    return { results, hasMore }
}

//* Pagers
class QueryPager extends VideoPager {
    /**
     * @param {import("./types.d.ts").HomeContext} context the query params
     */
    constructor(context) {
        const data = getHomepageContent(context);
        super(data.results, data.hasMore, context)
    }

    nextPage() {
        this.context.page = this.context.page + 1
        const data = getHomepageContent(this.context)
        this.results = data.results;
        this.hasMore = data.hasMore;
        return this
    }
}
class SearchPagerVideos extends VideoPager {
    /**
     * @param {import("./types").SearchContext} context the query params
     */
    constructor(context) {
        const resultsData = SearchPagerVideos.fetchAndProcessResults(context); // Fetch and process before calling `super`

        // Call the parent constructor with results, hasMore flag, and context
        super(resultsData.results, resultsData.hasMore, context);
    }

    /**
     * Fetches and processes the search results
     * @param {object} context - The search context
     * @returns {object} - An object containing `results` and `hasMore`
     */
    static fetchAndProcessResults(context) {
        const limit = context.page_size;
        const offset = (context.page - 1) * limit;
        let endpoint, queryKey;

        if (context.get_all) {
            // https://api-v2.soundcloud.com/search?q=search%20and%20destroy%20drake&client_id=VDJ3iu7ZYtUMibDTM2XcUbRijDa3L6ug&limit=20&offset=0&linked_partitioning=1&app_version=1683798046&app_locale=en
            endpoint = "search";
            queryKey = "q";
        } else {
            endpoint = "search/tracks";
            queryKey = "q";
        }

        // Fetch search results
        const json = SearchPagerVideos.fetchSearchResults(context, endpoint, queryKey, limit, offset);

        // Validate the response
        const collection = SearchPagerVideos.validateResponse(json);
        
        // Filter premium content if needed
        const filteredcollection = filterPremiumContent(collection);
        
        // Map the results
        const results = SearchPagerVideos.mapResults(filteredcollection);
        
        // Determine if there are more results
        const hasMore = results.length >= limit;

        return { results: results, hasMore };
    }

    /**
     * Constructs the URL, fetches data, and parses it as JSON
     * @param {object} context - The search context
     * @param {string} endpoint - The API endpoint
     * @param {string} queryKey - The query key for the search term
     * @param {number} limit - The number of results per page
     * @param {number} offset - The offset for pagination
     * @returns {object} - The parsed JSON response
     */
    static fetchSearchResults(context, endpoint, queryKey, limit, offset) {
        const url = `${API_URL}${endpoint}?${queryKey}=${encodeURIComponent(context.q)}&client_id=${CLIENT_ID}&limit=${limit}&offset=${offset}&linked_partitioning=1${URL_ADDITIVE}`;

        const resp = callUrl(url);
        let json;
        try {
            json = JSON.parse(resp.body);
        } catch (error) {
            throw new ScriptException("Invalid JSON response: " + error.message);
        }
        return json;
    }

    /**
     * Validates the response to ensure the collection exists
     * @param {object} json - The parsed JSON response
     * @returns {Array} - The collection of results
     */
    static validateResponse(json) {
        if (!json || !json.collection) {
            if (IS_TESTING) console.log("Soundcloud search response: " + JSON.stringify(json));
            throw new ScriptException("Could not find collection");
        }
        return json.collection;
    }

    /**
     * Maps the search results to platform-specific objects
     * @param {Array} collection - The search results collection
     * @returns {Array} - The mapped results
     */
    static mapResults(collection) {
        const results = [];

        for (const result of collection) {
            switch (result.kind) {
                case "track":
                    results.push(soundcloudTrackToPlatformVideo(result));
                    break;
                case "user":
                    continue    
                    results.push(soundcloudUserToPlatformChannel(result));
                    break;
                case "playlist":
                case "album":
                    // results.push(soundcloudPlaylistToPlatformPlaylist(result));
                    break;
                default:
                    if (IS_TESTING) console.log("Soundcloud search result: " + JSON.stringify(result));
                    throw new ScriptException("Unknown kind: " + result.kind);
            }
        }
        return results;
    }

    /**
     * Returns a new instance of the next page of results
     * @returns {SearchPagerVideos} - The next page instance
     */
    nextPage() {
        return new SearchPagerVideos({ ...this.context, page: this.context.page + 1 });
    }
}
class ChannelVideoPager extends VideoPager {
    /**
     * @param {import("./types.d.ts").ChannelVideoPagerContext} context
     */
    constructor(context) {
        if (!context.id) {
            const resp = callUrl(context.url)
            const matched = resp.body.match(/window\.__sc_hydration = (.+);/)
            if (!matched) {
                throw new ScriptException('Could not find channel info')
            }

            /** @type {import("./types").SCHydration[]} */
            const json = JSON.parse(matched[1])

            for (let object of json) {
                if (object.hydratable === 'user') {
                    /** @type {import("./types").SoundcloudUser} */
                    const data = object.data

                    context.id = data.id
                    break
                }
            }
        }

        const url = `${API_URL}users/${context.id}/tracks?representation=&client_id=${CLIENT_ID}&limit=${context.page_size}&offset=${context.offset_date}&linked_partitioning=1${URL_ADDITIVE}`

        if(IS_TESTING)
            console.log('Soundcloud channel url: ' + url)

        const resp = callUrl(url)
        const parsed = JSON.parse(resp.body)

        /** @type {import("./types").SoundcloudTrack[]} */
        const tracks = parsed['collection']

        const videos = tracks.map((track) => soundcloudTrackToPlatformVideo(track))

        context['offset_date'] = tracks[tracks.length - 1]?.created_at

        super(videos, tracks.length > 0, context)
    }

    nextPage() {
        this.context.page = this.context.page + 1
        return new ChannelVideoPager(this.context)
    }
}
class SearchPagerChannels extends ChannelPager {
    /**
     * @param {import("./types").SearchContext} context the query params
     */
    constructor(context) {
        const limit = context.page_size
        const offset = (context.page - 1) * limit
        const url = `${API_URL}search/users?q=${context.q}&client_id=${CLIENT_ID}&limit=${limit}&offset=${offset}&linked_partitioning=1${URL_ADDITIVE}`

        const resp = callUrl(url)

        /** @type {SearchResponse} */
        const json = JSON.parse(resp.body)

        /** @type {SoundcloudUser[]} */
        const users = json['collection']

        const results = users.map((user) => soundcloudUserToPlatformChannel(user))

        super(results, results.length >= context.page_size, context)
    }

    nextPage() {
        this.context.page = this.context.page + 1
        return new SearchPagerChannels(this.context)
    }
}
class ExtendableCommentPager extends CommentPager {
    /**
     * @param {import("./types.d.ts").HomeContext & {url: string; id: number|null}} context
     */
    constructor(context) {
        if (!context.id) {
            const resp = callUrl(context.url)
            const html = resp.body
            const matched = html.match(/window\.__sc_hydration = (.+);/)
            if (!matched) {
                throw new ScriptException('Could not find comment info')
            }

            /** @type {import("./types").SCHydration[]} */
            const json = JSON.parse(matched[1])

            for (let object of json) {
                if (object.hydratable === 'sound') {
                    /** @type {import("./types").SoundcloudTrack} */
                    const data = object.data

                    context.id = data.id
                    break
                }
            }
        }

        // https://api-v2.soundcloud.com/tracks/1506477625/comments?sort=newest&threaded=1&client_id=TihN0nuDfhghD9GVPbTtrSEa558lYo4V&limit=20&offset=0&linked_partitioning=1&app_version=1684153290&app_locale=en
        const limit = context.page_size
        const offset = (context.page - 1) * limit

        const url = `${API_URL}tracks/${context.id}/comments?sort=newest&threaded=1&client_id=${CLIENT_ID}&limit=${limit}&offset=${offset}&linked_partitioning=1${URL_ADDITIVE}`

        const resp = callUrl(url)

        /** @type {import("./types").CommentResponse} */
        const json = JSON.parse(resp.body)

        const comments = json['collection'].map((comment) => {
            return new Comment({
                contextUrl: context.url,
                author: new PlatformAuthorLink(
                    new PlatformID(PLATFORM, comment.user.id.toString(), config.id, PLATFORM_CLAIMTYPE),
                    comment.user.username,
                    comment.user.permalink_url,
                    comment.user.avatar_url
                ),
                message: comment.body,
                rating: new RatingLikes(0),
                date: parseInt(new Date(comment.created_at).getTime() / 1000),
                replyCount: 0,
                context: null,
            })
        })

        super(comments, json['next_href'] !== null, context)
    }

    nextPage() {
        this.context.page = this.context.page + 1
        return new ExtendableCommentPager(this.context)
    }
}

//* CONVERTERS
/**
 * Convert a Soundcloud person to a PlatformChannel
 * @param { import("./types").SoundcloudUser } scu
 * @returns { PlatformChannel }
 */
function soundcloudUserToPlatformChannel(scu) {
    if (!scu || typeof scu !== 'object') {
        throw new ScriptException('Invalid SoundCloud user object');
    }

    const visuals = scu.visuals?.visuals || [];
    const banner = visuals?.[0]?.visual_url || '';
    const links = visuals.map(v => v.link).filter(Boolean);

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, scu.id.toString(), config.id, PLATFORM_CLAIMTYPE),
        name: scu.username,
        thumbnail: scu.avatar_url,
        banner,
        subscribers: scu.followers_count || 0,
        description: scu.description,
        url: scu.permalink_url,
        links,
    });
}

/**
 * Convert a Soundcloud Track to a PlatformVideo
 * @param { import("./types").SoundcloudTrack } sct
 * @returns { PlatformVideo }
 */
function soundcloudTrackToPlatformVideo(sct) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, sct.id.toString(), config.id),
        name: sct.title,
        thumbnails: new Thumbnails([new Thumbnail(sct.artwork_url !== null ? sct.artwork_url.replace('large', 't500x500') : sct.artwork_url, 0)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, sct.user_id.toString(), config.id, PLATFORM_CLAIMTYPE),
            sct.user.username,
            sct.user.permalink_url,
            sct.user.avatar_url
        ),
        uploadDate: parseInt(new Date(sct.created_at).getTime() / 1000),
        duration: parseInt(sct.duration / 1000),
        viewCount: sct.playback_count,
        url: sct.permalink_url,
        isLive: false,
    })
}

/**
 * Replace the "m." prefix in a SoundCloud URL with an empty string.
 * 
 * @param {string} url - The SoundCloud URL to modify.
 * @returns {string} - The modified URL without the "m." prefix.
 */
function removeMobilePrefix(url) {
    return url.trim().replace("https://m.", "https://");
}

/**
 * Currently the trending pages has some duplicates, this function ensures that the array is unique based on the specified property.
 * Ensures that each item in the array is unique based on the specified property.
 * @param {Array} array - The array of objects to process.
 * @param {string} property - The property to use for uniqueness.
 * @returns {Array} - A new array with unique items based on the specified property.
 */
function ensureUniqueByProperty(array, property) {
    const seen = new Set();
    return array.filter(item => {
        if (item[property] && !seen.has(item[property])) {
            seen.add(item[property]);
            return true;
        }
        return false;
    });
}


function extractSoundCloudId(url) {
    if (!url) return null;

    const match = url.match(REGEX_CHANNEL);
    if (match) {
        return match[2]; // The second capturing group contains the SoundCloud ID
    }

    return null; // Return null if no match
}

function isSoundCloudChannelPlaylistUrl(url) {
    return REGEX_CHANNEL_PLAYLISTS.test(url) || REGEX_SYSTEM_PLAYLISTS.test(url);
}

function isSoundCloudSystemPlaylist(url) {
    return REGEX_SYSTEM_PLAYLISTS.test(url);
}

function standardPlaylistPager(url){
    
    const urlDetails = extractSoundCloudDetails(url);
    
    const channelSlug = urlDetails.userId;
    const playlist = urlDetails.trackId;
    
    const channel = source.getChannel(`${URL_BASE}/${channelSlug}`);
    
    const info = systemPlaylistsMaps[playlist];

    const apiPath = info?.apiPath ?? playlist;
    const playlistTitle =  info?.playlistTitle ?? playlist;
    const apiBasePath = info?.apiBasePath ?? 'https://api-v2.soundcloud.com/users';

    let withNext = [
        `${apiBasePath}/${channel.id.value}/${apiPath}?client_id=${CLIENT_ID}&limit=20&offset=0&linked_partitioning=1&app_version=${SOUNDCLOUD_APP_VERSION}&app_locale=en`
    ]
    
    class ChannelPlaylistsPager extends VideoPager {
        constructor({
            results,
            hasMore,
            context,
          }) {
            
            super(results, hasMore, context);
          }

          nextPage() {
              
            let withNext = this.context.withNext ?? [];
            let seen = this.context.seen ?? [];
            
            let all = this.results ?? [];

            let batch = http.batch();
            
            withNext.forEach(url => {
                batch.GET(url, {});
            });

            const responses = batch.execute();
        
            withNext = [];
            
            for(var ct = 0; ct < responses.length; ct++) {
                const res = responses[ct];
                
                if(res.isOk) {
                    
                    const body = JSON.parse(res.body);
                     
                    if(body.next_href) {
                        withNext.push(`${body.next_href}&client_id=${CLIENT_ID}`);
                    }
        
                    const currentCollection = body.collection.filter(c => c.track || c.kind === 'track').map(c => soundcloudTrackToPlatformVideo(c.track ?? c));
                       
                    all = [...all, ...currentCollection].filter(a => seen.indexOf(a.id.value) === -1);

                    seen = [...seen, ...all.map(a => a.id.value)];
                    
                }
                
            }
        
            const hasMore = !!withNext.length;
            
            return new ChannelPlaylistsPager({results: all, hasMore, context: { withNext, seen }});
          }
    }

    const author =  new PlatformAuthorLink(
        new PlatformID(PLATFORM,channel.id.value.toString(),config.id,PLATFORM_CLAIMTYPE),
        channel.name,
        channel.url,
        channel.thumbnail,
    );
    
    let contentPager = new ChannelPlaylistsPager({ context: { withNext } }).nextPage();
        
    return new PlatformPlaylistDetails({
        url: url,
        id: new PlatformID(PLATFORM, '', config.id),
        author: author,
        name: playlistTitle,
        // thumbnail: "",
        videoCount: -1,
        contents: contentPager
    });
}

function extractSoundCloudDetails(url) {
    if (!url) return null;

    const match = url.match(/^https?:\/\/(www\.|m\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?$/);
    if (match) {
        return {
            userId: match[2], // Extracted user/artist name
            trackId: match[3] // Extracted track identifier
        };
    }

    return null; // Return null if the URL doesn't match the expected pattern
}

function dateToUnixSeconds(date) {
    if (!date) {
      return 0;
    }
    
    return Math.round(Date.parse(date) / 1000);
}


/**
 * Filters out premium content based on user settings
 * @param {Array} results - The mapped results
 * @returns {Array} - The filtered results
 */
function filterPremiumContent(results) {
        // If hiding premium content is not enabled, return all results as-is
        if (!_settings.hidePremiumContent) {
            return results;
        }
    
        // Filter out premium content with "SUB_HIGH_TIER" monetization model
        return results.filter(item => item.monetization_model !== "SUB_HIGH_TIER");
}

function resolveTrack(url) {
    const match = url.match(/soundcloud\.com\/[^\/]+\/([^\/\?]+)/);
    if (match && match[1]) {
        // Get actual numeric track ID from the permalink
        const resp = callUrl(`${API_URL}resolve?url=${encodeURIComponent(url)}&client_id=${CLIENT_ID}${URL_ADDITIVE}`);
        debugger;
        if (resp.isOk) {
            const trackData = JSON.parse(resp.body);
            debugger;
            return trackData;
        }
    }
    return null;
}

// Helper function to extract track ID from URL
function extractTrackId(url) {
    return resolveTrack(url)?.id;
}

// Pager for related tracks
class RelatedTracksPager extends VideoPager {
    constructor({ videos, hasMore, nextUrl }) {
        super(videos, hasMore);
        this.nextUrl = nextUrl;
    }

    nextPage() {
        if (!this.nextUrl) {
            this.hasMore = false;
            return this;
        }

        // Add client_id to nextUrl if not present
        const url = this.nextUrl.includes('client_id=') ? 
            this.nextUrl : 
            `${this.nextUrl}${this.nextUrl.includes('?') ? '&' : '?'}client_id=${CLIENT_ID}${URL_ADDITIVE}`;

        const resp = callUrl(url);
        
        if (!resp.isOk) {
            this.hasMore = false;
            return this;
        }

        const json = JSON.parse(resp.body);
        
        this.results = (json.collection || []).map(track => soundcloudTrackToPlatformVideo(track));
        this.hasMore = !!json.next_href;
        this.nextUrl = json.next_href;
        
        return this;
    }
}

console.log('LOADED')
