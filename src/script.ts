//#region constants
import {
    Home,
    Protocol,
    DurationOptions,
    DateOptions,
    LicenseOptions,
    type FilterGroups,
    type Filters,
    type CommentsResponse,
    type FilterOptions,
    type HomeResponse,
    type LibraryResponse,
    type LikesResponse,
    type PlaylistResponse,
    type RelatedTracksResponse,
    type SCHydration,
    type SearchAutofillResponse,
    type SearchTypes,
    type Settings,
    type SoundCloudComment,
    type SoundCloudPlaylist,
    type SoundCloudSource,
    type SoundCloudSystemPlaylist,
    type SoundCloudTrack,
    type SoundCloudUser,
    type State,
    type TracksResponse,
    type UserTracksResponse,
    type OtherFilters,
    type SoundCloudFilters,
    type SoundCloudTrackMin,
    type FeedResponse,
    type SearchTracksResponse,
    type SearchUsersResponse,
    type SearchPlaylistsResponse,
} from "./types.js"

// https://developers.soundcloud.com/docs/api/explorer/open-api

const API_URL = "https://api-v2.soundcloud.com/"
const APP_LOCALE = "en"
const PLATFORM = "SoundCloud"
const USER_AGENT_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
const USER_AGENT_MOBILE = "Mozilla/5.0 (Linux; Android 10; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"

const URL_BASE = "https://soundcloud.com"

const REGEX_CHANNEL_PLAYLIST = /^https?:\/\/(www\.|m\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/sets\/[a-zA-Z0-9:/_-]+(\?[^#]*)?$/
const REGEX_LIKES_PLAYLIST = /^https?:\/\/(www\.|m\.)?soundcloud\.com\/[a-zA-Z0-9_-]+\/(likes)$/
const REGEX_CHANNEL = /^https?:\/\/(www\.|m\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/?$/
const REGEX_TRACK = /(?:https?:\/\/)?(?:www\.|m\.)?soundcloud\.com\/[a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+(?:\?[^\s#]*)?/

const HYDRATION_REGEX = /window\.__sc_hydration = (.+);/

const HARDCODED_THUMBNAIL_QUALITY = 1080
const HARDCODED_ZERO = 0

const local_http = http

let local_settings: Settings
/** State */
let local_state: State
//#endregion

//#region source methods
const local_source: SoundCloudSource = {
    enable,
    disable,
    saveState,
    getHome,
    searchSuggestions,
    getSearchCapabilities,
    search,
    searchChannels,
    isChannelUrl,
    isPlaylistUrl,
    isContentDetailsUrl,
    getChannel,
    getChannelContents,
    getChannelPlaylists,
    getContentDetails,
    getContentRecommendations,
    getComments,
    getUserSubscriptions,
    getUserPlaylists,
    getPlaylist,
    searchPlaylists,
}
init_source(local_source)
function init_source<
    S extends string,
    Options extends string,
    Groups extends FilterGroup<S, Options, FilterCapability<Options>[]>[],
    Filters extends GenericFilteredData<Options, Record<S, Options>>,
    ChannelTypes extends FeedType,
    SearchTypes extends FeedType,
    ChannelSearchTypes extends FeedType
>(local_source: Source<S, Options, Groups, Filters, ChannelTypes, SearchTypes, ChannelSearchTypes, Settings>) {
    for (const method_key of Object.keys(local_source)) {
        // @ts-expect-error assign to readonly constant source object
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        source[method_key] = local_source[method_key]
    }
}
//#endregion

//#region enable
function enable(conf: SourceConfig, settings: Settings, saved_state?: string | null) {
    if (IS_TESTING) {
        log("IS_TESTING true")
        log("logging configuration")
        log(conf)
        log("logging settings")
        log(settings)
        log("logging saved_state")
        log(saved_state)
    }
    local_settings = settings

    if (saved_state !== null && saved_state !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const state: State = JSON.parse(saved_state)
        local_state = state
    } else {
        const responses = local_http
            .batch()
            .GET("https://m.soundcloud.com/discover", { "User-Agent": USER_AGENT_MOBILE }, false)
            .GET(`${API_URL}me`, {}, true)
            .execute()

        if (responses[0] === undefined || responses[1] === undefined) {
            throw new ScriptException("unreachable")
        }

        const html = responses[0].body

        const matched = html.match(/"clientId":"([a-zA-Z0-9-_]+)"/)

        if (!matched?.[1]) {
            throw new ScriptException('Could not find client_id')
        }

        const matched_version = html.match(/"buildVersion":"([0-9]+)"/)

        if (!matched_version?.[1]) {
            throw new ScriptException('Could not find app_version')
        }

        const is_premium = (() => {
            if (bridge.isLoggedIn()) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const me_response: {
                    readonly consumer_subscription: {
                        readonly product: { readonly id: "consumer-high-tier" | "consumer-mid-tier" }
                    }
                } = JSON.parse(responses[1].body)

                return me_response.consumer_subscription.product.id === "consumer-high-tier"
            } else {
                return false
            }
        })()

        local_state = {
            app_version: parseInt(matched_version[1]),
            client_id: matched[1],
            is_premium
        }
    }
}
//#endregion

function disable() {
    log("SoundCloud log: disabling")
}

function saveState() {
    return JSON.stringify(local_state)
}

//#region home
function getHome() {
    if (bridge.isLoggedIn()) {
        switch (local_settings.home_preference) {
            case Home.Charts: {
                return new ChartsPager(0, 10)
            }
            case Home.Discover: {
                return new DiscoverPager(0, 10)
            }
            case Home.Feed: {
                return new FeedPager(0, 10)
            }
            default:
                throw assert_exhaustive(local_settings.home_preference, "unreachable")
        }
    } else {
        return new ChartsPager(0, 10)
    }

}
class FeedPager extends ContentPager {
    private next_href: string | null
    constructor(offset: number, limit: number) {
        const feed_url = new URL(`${API_URL}stream`)
        feed_url.searchParams.set("promoted_playlist", "true")
        feed_url.searchParams.set("activityTypes", "TrackPost,TrackRepost,PlaylistPost")
        feed_url.searchParams.set("client_id", local_state.client_id)
        feed_url.searchParams.set("limit", limit.toString())
        feed_url.searchParams.set("offset", offset.toString())
        feed_url.searchParams.set("linked_partitioning", (1).toString())
        feed_url.searchParams.set("app_version", local_state.app_version.toString())
        feed_url.searchParams.set("app_locale", APP_LOCALE)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const feed_response: FeedResponse = JSON.parse(local_http.GET(feed_url.toString(), { "User-Agent": USER_AGENT_DESKTOP }, true).body)

        super(format_feed_response(feed_response), feed_response.next_href !== null)

        this.next_href = feed_response.next_href
    }
    override nextPage(this: FeedPager) {
        if (!this.hasMore) {
            this.results = []
            return this
        }

        if (this.next_href === null) {
            throw new ScriptException("unreachable")
        }

        const url = new URL(this.next_href)
        url.searchParams.set("client_id", local_state.client_id)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const feed_response: FeedResponse = JSON.parse(local_http.GET(url.toString(), { "User-Agent": USER_AGENT_DESKTOP }, true).body)

        this.results = format_feed_response(feed_response)
        this.next_href = feed_response.next_href
        this.hasMore = feed_response.next_href !== null
        return this
    }
    override hasMorePagers(this: FeedPager): boolean {
        return this.hasMore
    }
}
function format_feed_response(response: FeedResponse): IPlatformContent[] {
    return response.collection.map(item => {
        const type = item.type
        switch (item.type) {
            case "track":
                return sound_cloud_track_to_platform_video(item.track)
            case "track-repost":
                return sound_cloud_track_to_platform_video(item.track)
            default:
                throw assert_exhaustive(item, `unknown item type ${type}`)
        }
    })
}
class DiscoverPager extends ContentPager {
    private next_href: string | null
    constructor(offset: number, limit: number) {
        const charts_url = new URL(`${API_URL}mixed-selections`)
        charts_url.searchParams.set("client_id", local_state.client_id)
        charts_url.searchParams.set("limit", limit.toString())
        charts_url.searchParams.set("offset", offset.toString())
        charts_url.searchParams.set("linked_partitioning", (1).toString())
        charts_url.searchParams.set("app_version", local_state.app_version.toString())
        charts_url.searchParams.set("app_locale", APP_LOCALE)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const discover_response: HomeResponse = JSON.parse(local_http.GET(charts_url.toString(), { "User-Agent": USER_AGENT_DESKTOP }, true).body)

        super(discover_response.collection.flatMap(selection => selection.items.collection.flatMap((selection_item) => {
            if (selection_item.kind === "user") {
                return []
            }
            return format_playlist(selection_item)
        })), discover_response.next_href !== null)

        this.next_href = discover_response.next_href
    }
    override nextPage(this: DiscoverPager) {
        if (!this.hasMore) {
            this.results = []
            return this
        }

        if (this.next_href === null) {
            throw new ScriptException("unreachable")
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const discover_response: HomeResponse = JSON.parse(local_http.GET(this.next_href, { "User-Agent": USER_AGENT_DESKTOP }, true).body)

        this.results = discover_response.collection.flatMap(selection => selection.items.collection.flatMap((selection_item) => {
            if (selection_item.kind === "user") {
                return []
            }
            return format_playlist(selection_item)
        }))
        this.next_href = discover_response.next_href
        this.hasMore = discover_response.next_href !== null
        return this
    }
    override hasMorePagers(this: DiscoverPager): boolean {
        return this.hasMore
    }
}
class ChartsPager extends ContentPager {
    private next_href: string | null
    constructor(offset: number, limit: number) {
        const charts_url = new URL(`${API_URL}charts/selections`)
        charts_url.searchParams.set("client_id", local_state.client_id)
        charts_url.searchParams.set("limit", limit.toString())
        charts_url.searchParams.set("offset", offset.toString())
        charts_url.searchParams.set("linked_partitioning", (1).toString())
        charts_url.searchParams.set("app_version", local_state.app_version.toString())
        charts_url.searchParams.set("app_locale", APP_LOCALE)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const charts_response: HomeResponse = JSON.parse(local_http.GET(charts_url.toString(), { "User-Agent": USER_AGENT_DESKTOP }, true).body)

        super(charts_response.collection.flatMap(selection => selection.items.collection.flatMap((selection_item) => {
            if (selection_item.kind === "user") {
                return []
            }
            return format_playlist(selection_item)
        })), charts_response.next_href !== null)

        this.next_href = charts_response.next_href
    }
    override nextPage(this: ChartsPager) {
        if (!this.hasMore) {
            this.results = []
            return this
        }

        if (this.next_href === null) {
            throw new ScriptException("unreachable")
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const charts_response: HomeResponse = JSON.parse(local_http.GET(this.next_href, { "User-Agent": USER_AGENT_DESKTOP }, true).body)

        this.results = charts_response.collection.flatMap(selection => selection.items.collection.flatMap((selection_item) => {
            if (selection_item.kind === "user") {
                return []
            }
            return format_playlist(selection_item)
        }))
        this.next_href = charts_response.next_href
        this.hasMore = charts_response.next_href !== null
        return this
    }
    override hasMorePagers(this: ChartsPager): boolean {
        return this.hasMore
    }
}
function format_playlist(playlist: SoundCloudSystemPlaylist | SoundCloudPlaylist): PlatformPlaylist {
    return new PlatformPlaylist({
        id: new PlatformID(PLATFORM, playlist.id.toString(), plugin.config.id),
        name: playlist.title,
        thumbnails: new Thumbnails([new Thumbnail(playlist.artwork_url, HARDCODED_THUMBNAIL_QUALITY)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, playlist.user.id.toString(), plugin.config.id),
            playlist.user.username,
            playlist.user.permalink_url,
            playlist.user.avatar_url,
            playlist.user.followers_count
        ),
        datetime: playlist.kind === "playlist"
            ? date_to_unix_seconds(playlist.last_modified)
            : playlist.last_updated !== null
                ? date_to_unix_seconds(playlist.last_updated)
                : Date.now() / 1000,
        url: playlist.permalink_url,
        videoCount: playlist.kind === "playlist" ? playlist.track_count : playlist.tracks.length,
        thumbnail: playlist.artwork_url
    })
}
//#endregion

//#region search
function searchSuggestions(query: string) {
    const url = new URL(`${API_URL}search/queries`)
    url.searchParams.set("q", query)
    url.searchParams.set("client_id", local_state.client_id)
    url.searchParams.set("limit", (10).toString())
    url.searchParams.set("offset", (0).toString())
    url.searchParams.set("linked_partitioning", (1).toString())
    url.searchParams.set("app_version", local_state.app_version.toString())
    url.searchParams.set("app_locale", APP_LOCALE)

    const resp = local_http.GET(url.toString(), {}, false)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const suggestions_response: SearchAutofillResponse = JSON.parse(resp.body)

    return suggestions_response.collection.map((item) => item.query)
}

function getSearchCapabilities() {
    return new ResultCapabilities<
        Filters,
        FilterOptions,
        FilterGroups,
        SearchTypes
    >(
        [Type.Feed.Mixed, Type.Feed.Videos],
        [],
        [new FilterGroup(
            "Duration",
            [
                new FilterCapability(DurationOptions.less_than_two, DurationOptions.less_than_two, DurationOptions.less_than_two),
                new FilterCapability(DurationOptions.two_to_ten, DurationOptions.two_to_ten, DurationOptions.two_to_ten),
                new FilterCapability(DurationOptions.ten_to_thirty, DurationOptions.ten_to_thirty, DurationOptions.ten_to_thirty),
                new FilterCapability(DurationOptions.more_than_thirty, DurationOptions.more_than_thirty, DurationOptions.more_than_thirty),
            ],
            false,
            "DURATION_FILTER"
        ),
        new FilterGroup(
            "Upload Date",
            [
                new FilterCapability(DateOptions.last_hour, DateOptions.last_hour, DateOptions.last_hour),
                new FilterCapability(DateOptions.today, DateOptions.today, DateOptions.today),
                new FilterCapability(DateOptions.this_week, DateOptions.this_week, DateOptions.this_week),
                new FilterCapability(DateOptions.this_month, DateOptions.this_month, DateOptions.this_month),
                new FilterCapability(DateOptions.this_year, DateOptions.this_year, DateOptions.this_year),
            ],
            false,
            "DATE_FILTER"
        ),
        new FilterGroup(
            "Usage Purpose",
            [
                new FilterCapability(LicenseOptions.modify_commercially, LicenseOptions.modify_commercially, LicenseOptions.modify_commercially),
                new FilterCapability(LicenseOptions.use_commercially, LicenseOptions.use_commercially, LicenseOptions.use_commercially),
                new FilterCapability(LicenseOptions.share, LicenseOptions.share, LicenseOptions.share),
            ],
            false,
            "LICENSE_FILTER"
        )],
    )
}
function search(query: string, _type: SearchTypes | null, order: Order | null, filters: OtherFilters | null): VideoPager {
    if (order !== null) {
        throw new ScriptException("unreachable")
    }
    if (filters === null) {
        throw new ScriptException("TODO")
    }
    const sc_filters: SoundCloudFilters = {
        date: (() => {
            const date_filter = filters.DATE_FILTER?.[0]
            switch (date_filter) {
                case DateOptions.last_hour:
                    return "last_hour"
                case DateOptions.today:
                    return "last_day"
                case DateOptions.this_week:
                    return "last_week"
                case DateOptions.this_month:
                    return "last_month"
                case DateOptions.this_year:
                    return "last_year"
                case undefined:
                    return undefined
                default:
                    throw assert_exhaustive(date_filter, "unreachable")
            }
        })(),
        duration: (() => {
            const duration_filter = filters.DURATION_FILTER?.[0]
            switch (duration_filter) {
                case DurationOptions.less_than_two:
                    return "short"
                case DurationOptions.two_to_ten:
                    return "medium"
                case DurationOptions.ten_to_thirty:
                    return "long"
                case DurationOptions.more_than_thirty:
                    return "epic"
                case undefined:
                    return undefined
                default:
                    throw assert_exhaustive(duration_filter, "unreachable")
            }
        })(),
        license: (() => {
            const license_filter = filters.LICENSE_FILTER?.[0]
            switch (license_filter) {
                case LicenseOptions.modify_commercially:
                    return "to_modify_commercially"
                case LicenseOptions.use_commercially:
                    return "to_use_commercially"
                case LicenseOptions.share:
                    return "to_share"
                case undefined:
                    return undefined
                default:
                    throw assert_exhaustive(license_filter, "unreachable")
            }
        })()
    }

    return new TrackSearchPager(query, 20, 0, sc_filters)
}
function search_tracks(query: string, limit: number, offset: number, filters: SoundCloudFilters) {
    const url = new URL(`${API_URL}search/tracks`)
    url.searchParams.set("q", query)
    url.searchParams.set("client_id", local_state.client_id)
    url.searchParams.set("limit", limit.toString())
    url.searchParams.set("offset", offset.toString())
    url.searchParams.set("linked_partitioning", (1).toString())
    url.searchParams.set("app_version", local_state.app_version.toString())
    url.searchParams.set("app_locale", APP_LOCALE)
    if (filters.date !== undefined) {
        url.searchParams.set("filter.created_at", filters.date)
    }
    if (filters.duration !== undefined) {
        url.searchParams.set("filter.duration", filters.duration)
    }
    if (filters.license !== undefined) {
        url.searchParams.set("filter.license", filters.license)
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const search_response: SearchTracksResponse = JSON.parse(local_http.GET(url.toString(), {}, true).body)

    return search_response
}
function filter_tracks(track: SoundCloudTrack): boolean {
    return !local_settings.hide_premium_content || !is_premium(track) || local_state.is_premium
}
class TrackSearchPager extends VideoPager {
    private next_href: string | undefined
    constructor(query: string, limit: number, offset: number, filters: SoundCloudFilters) {
        const response = search_tracks(query, limit, offset, filters)

        const results = response.collection.filter(filter_tracks).map(sound_cloud_track_to_platform_video)

        super(results, response.next_href !== undefined)

        this.next_href = response.next_href
    }
    override nextPage(this: TrackSearchPager) {
        if (this.next_href === undefined) {
            throw new ScriptException("unreachable")
        }

        const url = new URL(this.next_href)
        url.searchParams.set("client_id", local_state.client_id)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const search_response: SearchTracksResponse = JSON.parse(passthrough_log(local_http.GET(url.toString(), {}, true)).body)

        this.results = search_response.collection.filter(filter_tracks).map((user) => sound_cloud_track_to_platform_video(user))
        this.hasMore = search_response.next_href !== undefined
        this.next_href = search_response.next_href

        return this
    }
    override hasMorePagers(this: TrackSearchPager): boolean {
        return this.hasMore
    }
}
function searchChannels(query: string) {
    return new SoundCloudChannelPager(query, 20, 0)
}
class SoundCloudChannelPager extends ChannelPager {
    private next_href: string | undefined
    constructor(query: string, limit: number, offset: number) {
        const response = search_channels(query, limit, offset)

        const results = response.collection.map((user) => sound_cloud_user_to_platform_channel(user))

        super(results, response.next_href !== undefined)

        this.next_href = response.next_href
    }
    override nextPage(this: SoundCloudChannelPager) {
        if (this.next_href === undefined) {
            throw new ScriptException("unreachable")
        }

        const url = new URL(this.next_href)
        url.searchParams.set("client_id", local_state.client_id)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const search_response: SearchUsersResponse = JSON.parse(local_http.GET(url.toString(), {}, true).body)

        this.results = search_response.collection.map((user) => sound_cloud_user_to_platform_channel(user))
        this.hasMore = search_response.next_href !== undefined
        this.next_href = search_response.next_href

        return this
    }
    override hasMorePagers(this: SoundCloudChannelPager): boolean {
        return this.hasMore
    }
}
function search_channels(query: string, limit: number, offset: number) {
    const url = new URL(`${API_URL}search/users`)
    url.searchParams.set("q", query)
    url.searchParams.set("client_id", local_state.client_id)
    url.searchParams.set("limit", limit.toString())
    url.searchParams.set("offset", offset.toString())
    url.searchParams.set("linked_partitioning", (1).toString())
    url.searchParams.set("app_version", local_state.app_version.toString())
    url.searchParams.set("app_locale", APP_LOCALE)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const search_response: SearchUsersResponse = JSON.parse(local_http.GET(url.toString(), {}, true).body)

    return search_response
}
//#endregion

//#region channel
function isChannelUrl(url: string) {
    // see if it matches https://soundcloud.com/nfrealmusic
    return !isPlaylistUrl(url) && REGEX_CHANNEL.test(url)
}
function getChannel(url: string): PlatformChannel {
    const html = local_http.GET(url, {}, false).body

    const matched = html.match(HYDRATION_REGEX)
    if (!matched?.[1]) {
        throw new ScriptException('Could not find channel info')
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const hydration_data: SCHydration[] = JSON.parse(matched[1])

    const user_hydration = hydration_data.find(hydration_item => hydration_item.hydratable === "user")

    if (user_hydration === undefined) {
        throw new ScriptException('Could not find channel info')
    }

    const platform_channel = sound_cloud_user_to_platform_channel(user_hydration.data)

    return platform_channel
}
function getChannelContents(url: string) {
    return new ChannelVideoPager(url, 20, 0)
}
function load_user(url: string) {
    const html = local_http.GET(url, {}, false).body

    const matched = html.match(HYDRATION_REGEX)
    if (!matched?.[1]) {
        throw new ScriptException('Could not find channel info')
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const hydration_data: SCHydration[] = JSON.parse(matched[1])

    const user_hydration = hydration_data.find(hydration_item => hydration_item.hydratable === "user")

    if (user_hydration === undefined) {
        throw new ScriptException('Could not find channel info')
    }

    return user_hydration.data
}
class ChannelVideoPager extends VideoPager {
    next_href: string | null
    constructor(url: string, limit: number, offset: number) {
        const user = load_user(url)

        const tracks_url = new URL(`${API_URL}users/${user.id.toString()}/tracks`)
        tracks_url.searchParams.set("client_id", local_state.client_id)
        tracks_url.searchParams.set("limit", limit.toString())
        tracks_url.searchParams.set("offset", offset.toString())
        tracks_url.searchParams.set("linked_partitioning", (1).toString())
        tracks_url.searchParams.set("app_version", local_state.app_version.toString())
        tracks_url.searchParams.set("app_locale", APP_LOCALE)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: UserTracksResponse = JSON.parse(local_http.GET(tracks_url.toString(), {}, true).body)

        const videos = response.collection.filter(filter_tracks).map((track) => sound_cloud_track_to_platform_video(track))

        super(videos, response.next_href !== null)

        this.next_href = response.next_href
    }
    override nextPage(this: ChannelVideoPager) {
        if (this.next_href === null) {
            throw new ScriptException("unreachable")
        }

        const url = new URL(this.next_href)
        url.searchParams.set("client_id", local_state.client_id)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: UserTracksResponse = JSON.parse(local_http.GET(url.toString(), {}, true).body)

        this.results = response.collection.filter(filter_tracks).map((track) => sound_cloud_track_to_platform_video(track))
        this.hasMore = response.next_href !== null
        this.next_href = response.next_href

        return this
    }
    override hasMorePagers(this: ChannelVideoPager): boolean {
        return this.hasMore
    }
}

function getChannelPlaylists(url: string): PlaylistPager {
    const channel_slug = extract_sound_cloud_id(url)

    const user = load_user(`${URL_BASE}/${channel_slug}`)

    const author = new PlatformAuthorLink(
        new PlatformID(PLATFORM, user.id.toString(), plugin.config.id),
        user.username,
        user.permalink_url,
        user.avatar_url,
        user.followers_count
    )

    const likes_playlist = new PlatformPlaylist({
        id: new PlatformID(PLATFORM, "likes", plugin.config.id),
        author: author,
        name: "Liked Tracks",
        thumbnail: user.avatar_url,
        url: `https://soundcloud.com/${channel_slug}/likes`,
    })

    return new UserPlaylistsPager(user.id, 10, 0, likes_playlist)
}
class UserPlaylistsPager extends PlaylistPager {
    private albums_next_href: string | null
    private playlists_next_href: string | null
    constructor(user_id: number, limit: number, offset: number, likes_playlist: PlatformPlaylist) {
        const albums_url = new URL(`${API_URL}users/${user_id.toString()}/albums`)
        albums_url.searchParams.set("client_id", local_state.client_id)
        albums_url.searchParams.set("limit", limit.toString())
        albums_url.searchParams.set("offset", offset.toString())
        albums_url.searchParams.set("linked_partitioning", (1).toString())
        albums_url.searchParams.set("app_version", local_state.app_version.toString())
        albums_url.searchParams.set("app_locale", APP_LOCALE)

        const playlists_url = new URL(`${API_URL}users/${user_id.toString()}/playlists_without_albums`)
        playlists_url.searchParams.set("client_id", local_state.client_id)
        playlists_url.searchParams.set("limit", limit.toString())
        playlists_url.searchParams.set("offset", offset.toString())
        playlists_url.searchParams.set("linked_partitioning", (1).toString())
        playlists_url.searchParams.set("app_version", local_state.app_version.toString())
        playlists_url.searchParams.set("app_locale", APP_LOCALE)

        const responses = local_http.batch().GET(albums_url.toString(), {}, false).GET(playlists_url.toString(), {}, false).execute()

        if (responses[0] === undefined || responses[1] === undefined) {
            throw new ScriptException("unreachable")
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const albums_response: PlaylistResponse = JSON.parse(responses[0].body)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const playlists_response: PlaylistResponse = JSON.parse(responses[1].body)

        super(interleave([
            [likes_playlist],
            albums_response.collection.map(playlist => new PlatformPlaylist(sound_cloud_playlist_to_platform_playlist_def(playlist))),
            playlists_response.collection.map(playlist => new PlatformPlaylist(sound_cloud_playlist_to_platform_playlist_def(playlist)))
        ]), albums_response.next_href !== null || playlists_response.next_href !== null)

        this.albums_next_href = albums_response.next_href
        this.playlists_next_href = playlists_response.next_href
    }
    override nextPage(this: UserPlaylistsPager): UserPlaylistsPager {
        if (!this.hasMore) {
            this.results = []
            return this
        }
        if (this.albums_next_href !== null && this.playlists_next_href !== null) {
            const albums_url = new URL(this.albums_next_href)
            albums_url.searchParams.set("client_id", local_state.client_id)
            const playlists_url = new URL(this.playlists_next_href)
            playlists_url.searchParams.set("client_id", local_state.client_id)

            const responses = local_http.batch().GET(albums_url.toString(), {}, false).GET(playlists_url.toString(), {}, false).execute()

            if (responses[0] === undefined || responses[1] === undefined) {
                throw new ScriptException("unreachable")
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const albums_response: PlaylistResponse = JSON.parse(responses[0].body)
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const playlists_response: PlaylistResponse = JSON.parse(responses[1].body)

            this.results = interleave([
                albums_response.collection.map(playlist => new PlatformPlaylist(sound_cloud_playlist_to_platform_playlist_def(playlist))),
                playlists_response.collection.map(playlist => new PlatformPlaylist(sound_cloud_playlist_to_platform_playlist_def(playlist)))
            ])

            this.hasMore = albums_response.next_href !== null || playlists_response.next_href !== null
            this.playlists_next_href = playlists_response.next_href
            this.albums_next_href = albums_response.next_href
        } else if (this.albums_next_href !== null) {
            const albums_url = new URL(this.albums_next_href)
            albums_url.searchParams.set("client_id", local_state.client_id)

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const albums_response: PlaylistResponse = JSON.parse(local_http.GET(albums_url.toString(), {}, false).body)

            this.results = albums_response.collection.map(playlist => new PlatformPlaylist(sound_cloud_playlist_to_platform_playlist_def(playlist)))

            this.hasMore = albums_response.next_href !== null
            this.albums_next_href = albums_response.next_href
        } else if (this.playlists_next_href !== null) {
            const playlists_url = new URL(this.playlists_next_href)
            playlists_url.searchParams.set("client_id", local_state.client_id)

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const playlists_response: PlaylistResponse = JSON.parse(local_http.GET(playlists_url.toString(), {}, false).body)

            this.results = playlists_response.collection.map(playlist => new PlatformPlaylist(sound_cloud_playlist_to_platform_playlist_def(playlist)))

            this.hasMore = playlists_response.next_href !== null
            this.playlists_next_href = playlists_response.next_href
        } else {
            throw new ScriptException("unreachable")
        }

        return this
    }
    override hasMorePagers(this: UserPlaylistsPager): boolean {
        return this.hasMore
    }
}
//#endregion

//#region content
function isContentDetailsUrl(url: string) {
    // https://soundcloud.com/toosii2x/toosii-favorite-song
    return !isPlaylistUrl(url) && REGEX_TRACK.test(url)
}

function getContentDetails(url: string): PlatformContentDetails {
    const html = local_http.GET(url, {}, true).body

    const matched = html.match(HYDRATION_REGEX)
    if (!matched?.[1]) {
        throw new ScriptException('Could not find track info')
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const hydration_data: SCHydration[] = JSON.parse(matched[1])

    const sound_hydration = hydration_data.find(hydration_item => hydration_item.hydratable === "sound")

    if (sound_hydration === undefined) {
        throw new ScriptException('Could not find track info')
    }

    const sct = sound_hydration.data

    // Exclude opus codec completely, regardless of protocol since it's not well supported
    // we've had playback issues in the past
    const filtered_transcodings = sct.media.transcodings.filter(transcoding => !transcoding.preset.includes("opus"))

    const high_progressive = filtered_transcodings.find(transcoding => transcoding.quality === "hq" && transcoding.format.protocol === "progressive")
    const high_hls = filtered_transcodings.find(transcoding => transcoding.quality === "hq" && transcoding.format.protocol === "hls")
    const standard_progressive = filtered_transcodings.find(transcoding => transcoding.quality === "sq" && transcoding.format.protocol === "progressive")
    const standard_hls = filtered_transcodings.find(transcoding => transcoding.quality === "sq" && transcoding.format.protocol === "hls")

    const selected_transcoding = (() => {
        switch (local_settings.preferred_protocol) {
            case Protocol.Progressive:
                if (high_progressive !== undefined) {
                    return high_progressive
                } else if (high_hls !== undefined) {
                    return high_hls
                } else if (standard_progressive !== undefined) {
                    return standard_progressive
                } else if (standard_hls !== undefined) {
                    return standard_hls
                }
                throw new ScriptException("unable to find media source")
            case Protocol.HLS:
                if (high_progressive !== undefined) {
                    return high_progressive
                } else if (high_hls !== undefined) {
                    return high_hls
                } else if (standard_progressive !== undefined) {
                    return standard_progressive
                } else if (standard_hls !== undefined) {
                    return standard_hls
                }
                throw new ScriptException("unable to find media source")
            default:
                throw assert_exhaustive(local_settings.preferred_protocol, "unhandled protocol type")
        }
    })()

    const media_url = new URL(selected_transcoding.url)
    media_url.searchParams.append('client_id', local_state.client_id)
    media_url.searchParams.append('track_authorization', sct.track_authorization)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: { url: string } = JSON.parse(local_http.GET(media_url.toString(), {}, true).body)

    const source = (() => {
        switch (selected_transcoding.format.protocol) {
            case "progressive": {
                const { container, codec } = extract_container_and_codec(selected_transcoding.format.mime_type)
                return new AudioUrlSource({
                    name: selected_transcoding.preset,
                    duration: Math.round(selected_transcoding.duration / 1000),
                    url: response.url,
                    container,
                    codec,
                    language: Language.UNKNOWN,
                    bitrate: HARDCODED_ZERO,
                })
            }
            case "hls":
                return new HLSSource({
                    name: selected_transcoding.preset,
                    duration: Math.round(selected_transcoding.duration / 1000),
                    url: response.url,
                    language: Language.UNKNOWN
                })
            default:
                throw assert_exhaustive(selected_transcoding.format.protocol, "unreachable")
        }
    })()

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, sct.id.toString(), plugin.config.id),
        name: sct.title,
        thumbnails: new Thumbnails([new Thumbnail(sct.artwork_url ?? sct.user.avatar_url.replace("large", "t500x500"), HARDCODED_THUMBNAIL_QUALITY)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, sct.user_id.toString(), plugin.config.id),
            sct.user.username,
            sct.user.permalink_url,
            sct.user.avatar_url
        ),
        datetime: date_to_unix_seconds(sct.display_date),
        url: sct.permalink_url,
        duration: Math.round(sct.duration / 1000),
        viewCount: sct.playback_count,
        isLive: false,
        shareUrl: sct.permalink_url,
        description: sct.description,
        video: new UnMuxVideoSourceDescriptor([], [source]),
        rating: new RatingLikes(sct.likes_count),
        getContentRecommendations: () => {
            return getContentRecommendations(sct.permalink_url)
        }
    })
}

function getContentRecommendations(url: string) {
    const track_id = extract_track_id(url)

    return new RelatedTracksPager(track_id, 10, 0)
}
class RelatedTracksPager extends VideoPager {
    private next_href: string | null
    constructor(track_id: number, limit: number, offset: number) {
        const related_tracks_url = new URL(`${API_URL}tracks/${track_id.toString()}/related`)
        related_tracks_url.searchParams.set("client_id", local_state.client_id)
        related_tracks_url.searchParams.set("limit", limit.toString())
        related_tracks_url.searchParams.set("offset", offset.toString())
        related_tracks_url.searchParams.set("linked_partitioning", (1).toString())
        related_tracks_url.searchParams.set("app_version", local_state.app_version.toString())
        related_tracks_url.searchParams.set("app_locale", APP_LOCALE)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: RelatedTracksResponse = JSON.parse(local_http.GET(related_tracks_url.toString(), {}, false).body)

        super(response.collection.map(track => sound_cloud_track_to_platform_video(track)), response.next_href !== null)
        this.next_href = response.next_href
    }
    override nextPage(this: RelatedTracksPager): RelatedTracksPager {
        if (this.next_href === null) {
            throw new ScriptException("unreachable")
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: RelatedTracksResponse = JSON.parse(local_http.GET(this.next_href.toString(), {}, false).body)

        this.results = response.collection.map(track => sound_cloud_track_to_platform_video(track))
        this.hasMore = response.next_href !== null
        this.next_href = response.next_href

        return this
    }
    override hasMorePagers(this: RelatedTracksPager): boolean {
        return this.hasMore
    }
}

function getComments(url: string): CommentPager {
    const track_id = extract_track_id(url)
    return new SoundCloudCommentPager(url, track_id, 20, 0)
}
// interestingly SoundCloud renders comments as subcomments if the track timestamp tagged on the comment matches a previously posted comment

class SoundCloudCommentPager extends CommentPager {
    private next_href: string | null
    constructor(private readonly track_url: string, track_id: number, limit: number, offset: number) {
        const url = new URL(`${API_URL}tracks/${track_id.toString()}/comments`)
        url.searchParams.set("client_id", local_state.client_id)
        url.searchParams.set("offset", offset.toString())
        url.searchParams.set("threaded", (1).toString())
        url.searchParams.set("sort", "newest")
        url.searchParams.set("limit", limit.toString())
        url.searchParams.set("app_version", local_state.app_version.toString())
        url.searchParams.set("app_locale", APP_LOCALE)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: CommentsResponse = JSON.parse(local_http.GET(url.toString(), {}, false).body)

        super(format_comments(track_url, response), response.next_href !== null)

        this.next_href = response.next_href
    }
    override nextPage(this: SoundCloudCommentPager): SoundCloudCommentPager {
        if (this.next_href === null) {
            throw new ScriptException("unreachable")
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: CommentsResponse = JSON.parse(local_http.GET(this.next_href, {}, false).body)

        this.results = format_comments(this.track_url, response)
        this.hasMore = response.next_href !== null
        this.next_href = response.next_href

        return this
    }
    override hasMorePagers(this: SoundCloudCommentPager): boolean {
        return this.hasMore
    }
}
function format_comments(track_url: string, response: CommentsResponse): PlatformComment[] {
    const comments: SoundCloudComment[] = []
    const sub_comments_map = new Map<number, SoundCloudComment[]>()

    for (const comment of response.collection) {
        const sub_comments = sub_comments_map.get(comment.timestamp)

        if (sub_comments === undefined) {
            sub_comments_map.set(comment.timestamp, [])
            comments.push(comment)
        } else {
            sub_comments.push(comment)
        }
    }

    return comments.map(comment => {
        return format_comment(track_url, comment, sub_comments_map.get(comment.timestamp) ?? [])
    })
}
function format_comment(track_url: string, comment: SoundCloudComment, replies: SoundCloudComment[]): PlatformComment {
    const get_replies = () => {
        return new CommentPager(replies.map(sub_comment => format_comment(track_url, sub_comment, [])), false)
    }

    const pt = new PlatformComment({
        contextUrl: track_url,
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, comment.user.id.toString(), plugin.config.id),
            comment.user.username,
            comment.user.permalink_url,
            comment.user.avatar_url,
            comment.user.followers_count
        ),
        message: comment.body,
        // likes are available through a GraphQL api however it looks like there must be a separate request per user to get the likes for their comments specifically which would be a number of requests  
        // rating: new RatingLikes()
        date: date_to_unix_seconds(comment.created_at),
        replyCount: replies.length,
        getReplies: get_replies
    })

    // @ts-expect-error TODO remove once source.js changes are live
    pt.getReplies = get_replies

    return pt
}
//#endregion

//#region user
function getUserSubscriptions() {
    const html = local_http.GET("https://soundcloud.com/you/following", {}, true).body
    const matched = html.match(HYDRATION_REGEX)
    if (matched?.[1] === undefined) {
        throw new ScriptException('Could not find user info')
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const hydration_data: SCHydration[] = JSON.parse(matched[1])

    const user_hydration = hydration_data.find(hydration_item => hydration_item.hydratable === "meUser")

    if (user_hydration === undefined) {
        throw new ScriptException('Could not find user info')
    }

    const url = new URL(`${API_URL}users/${user_hydration.data.id.toString()}/followings`)
    url.searchParams.set("client_id", local_state.client_id)
    url.searchParams.set("limit", (12).toString())
    url.searchParams.set("offset", (0).toString())
    url.searchParams.set("linked_partitioning", (1).toString())
    url.searchParams.set("app_version", local_state.app_version.toString())
    url.searchParams.set("app_locale", APP_LOCALE)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let response: {
        readonly collection: SoundCloudUser[]
        readonly next_href?: string
    } = JSON.parse(local_http.GET(url.toString(), {}, false).body)

    const subscriptions = response.collection.map(user => user.permalink_url)

    while (response.next_href) {
        const url = new URL(response.next_href)
        url.searchParams.set("client_id", local_state.client_id)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        response = JSON.parse(local_http.GET(url.toString(), {}, false).body)

        subscriptions.push(...response.collection.map(user => user.permalink_url))
    }

    return subscriptions
}
function getUserPlaylists() {
    // https://api-v2.soundcloud.com/me/library/all?client_id=AXHkknI02RnaQ0vVJ3FK3pVcoToTlmFK&limit=10&offset=0&linked_partitioning=1&app_version=1746717941&app_locale=en
    // https://api-v2.soundcloud.com/users/138758236/track_likes?client_id=AXHkknI02RnaQ0vVJ3FK3pVcoToTlmFK&limit=24&offset=0&linked_partitioning=1&app_version=1746717941&app_locale=en

    const url = new URL(`${API_URL}me/library/all`)
    url.searchParams.set("client_id", local_state.client_id)
    url.searchParams.set("limit", (10).toString())
    url.searchParams.set("offset", (0).toString())
    url.searchParams.set("linked_partitioning", (1).toString())
    url.searchParams.set("app_version", local_state.app_version.toString())
    url.searchParams.set("app_locale", APP_LOCALE)

    const response = local_http.batch()
        .GET("https://soundcloud.com/you/following", {}, true)
        .GET(url.toString(), {}, true)
        .execute()

    if (response[0] === undefined || response[1] === undefined) {
        throw new ScriptException("unreachable")
    }

    const html = response[0].body

    const matched = html.match(HYDRATION_REGEX)
    if (matched?.[1] === undefined) {
        throw new ScriptException("Could not find user info")
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const hydration_data: SCHydration[] = JSON.parse(matched[1])

    const user_hydration = hydration_data.find(hydration_item => hydration_item.hydratable === "meUser")

    if (user_hydration === undefined) {
        throw new ScriptException("Could not find user info")
    }

    const playlists = [`https://soundcloud.com/${user_hydration.data.permalink}/likes`]

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let library_response: LibraryResponse = JSON.parse(response[1].body)

    while (library_response.next_href !== null) {
        const url = new URL(library_response.next_href)
        url.searchParams.set("client_id", local_state.client_id)

        playlists.push(...library_response.collection.map((playlist) => playlist.type !== "system-playlist-like" ? playlist.playlist.permalink_url : playlist.system_playlist.permalink_url))

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        library_response = JSON.parse(local_http.GET(url.toString(), {}, true).body)
    }

    return playlists
}
// TODO add playback tracking
// SoundCloud sends play and pause actions to this endpoint 
// https://api-v2.soundcloud.com/me
// that info gets used to generate user history
// https://soundcloud.com/you/history
// function getPlaybackTracker(url: string): SoundCloudPlaybackTracker {
//     return new SoundCloudPlaybackTracker(url)
// }
// class SoundCloudPlaybackTracker extends PlaybackTracker {
//     constructor(url: string) {
//         console.log(url)
//         super(1000)
//     }
// }
//#endregion

//#region playlist
function isPlaylistUrl(url: string) {
    return is_sound_cloud_playlist_url(url)
}
class LikesPlaylistContentsPager extends VideoPager {
    private next_href: string | null
    constructor(user_id: number) {
        const likes_url = new URL(`${API_URL}users/${user_id.toString()}/likes`)
        likes_url.searchParams.set("client_id", local_state.client_id)
        likes_url.searchParams.set("limit", (24).toString())
        likes_url.searchParams.set("offset", (0).toString())
        likes_url.searchParams.set("linked_partitioning", (1).toString())
        likes_url.searchParams.set("app_version", local_state.app_version.toString())
        likes_url.searchParams.set("app_locale", APP_LOCALE)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: LikesResponse = JSON.parse(local_http.GET(likes_url.toString(), {}, false).body)

        super(response.collection.filter(item => "track" in item).map(item => sound_cloud_track_to_platform_video(item.track)), response.next_href !== null)

        this.next_href = response.next_href
    }
    override nextPage(this: LikesPlaylistContentsPager): LikesPlaylistContentsPager {
        if (this.next_href === null) {
            throw new ScriptException("unreachable")
        }

        const url = new URL(this.next_href)
        url.searchParams.set("client_id", local_state.client_id)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: LikesResponse = JSON.parse(local_http.GET(url.toString(), {}, false).body)

        this.results = response.collection.filter(item => "track" in item).map(item => sound_cloud_track_to_platform_video(item.track))
        this.hasMore = response.next_href !== null
        this.next_href = response.next_href

        return this
    }
    override hasMorePagers(this: LikesPlaylistContentsPager): boolean {
        return this.hasMore
    }
}
function get_likes_playlist(url: string): PlatformPlaylistDetails {
    const html = local_http.GET(url, {}, false).body

    const matched = html.match(HYDRATION_REGEX)
    if (matched?.[1] === undefined) {
        throw new ScriptException("Could not find playlist info")
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const hydration_data: SCHydration[] = JSON.parse(matched[1])

    const user_hydration = hydration_data.find(hydration_item => hydration_item.hydratable === "user")

    if (user_hydration === undefined) {
        throw new ScriptException("Could not find playlist info")
    }

    return new PlatformPlaylistDetails({
        id: new PlatformID(PLATFORM, `${user_hydration.data.permalink}/likes`, plugin.config.id),
        name: `Likes by ${user_hydration.data.username}`,
        thumbnails: new Thumbnails([new Thumbnail(user_hydration.data.avatar_url, HARDCODED_THUMBNAIL_QUALITY)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, user_hydration.data.id.toString(), plugin.config.id),
            user_hydration.data.username,
            user_hydration.data.permalink_url,
            user_hydration.data.avatar_url,
            user_hydration.data.followers_count
        ),
        url,
        thumbnail: user_hydration.data.avatar_url,
        contents: new LikesPlaylistContentsPager(user_hydration.data.id)
    })
}
function getPlaylist(url: string): PlatformPlaylistDetails {
    if (is_sound_cloud_likes_playlist(url)) {
        return get_likes_playlist(url)
    }

    const response = local_http.GET(url, {}, true)
    if (response.code === 404) {
        if (bridge.isLoggedIn()) {
            throw new ScriptException("Playlist doesn't exist")
        } else {
            throw new LoginRequiredException("Login to view this playlist")
        }
    }

    const html = response.body

    const matched = html.match(HYDRATION_REGEX)
    if (matched?.[1] === undefined) {
        throw new ScriptException("Could not find playlist info")
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const hydration_data: SCHydration[] = JSON.parse(matched[1])

    const playlist_hydration = hydration_data.find(hydration_item => hydration_item.hydratable === "playlist")
    const system_playlist_hydration = hydration_data.find(hydration_item => hydration_item.hydratable === "systemPlaylist")

    if (playlist_hydration === undefined) {
        if (system_playlist_hydration === undefined) {
            throw new ScriptException("Could not find playlist info")
        }
        return new PlatformPlaylistDetails(sound_cloud_playlist_to_platform_playlist_details_def(system_playlist_hydration.data))
    }

    return new PlatformPlaylistDetails(sound_cloud_playlist_to_platform_playlist_details_def(playlist_hydration.data))
}
function searchPlaylists(query: string): PlaylistSearchResultsPager {
    return new PlaylistSearchResultsPager(query, 20, 0)
}
class PlaylistSearchResultsPager extends PlaylistPager {
    private playlists_next_href: string | undefined
    private albums_next_href: string | undefined
    constructor(query: string, limit: number, offset: number) {
        const playlists_url = search_playlists_url(query, limit, offset)
        const albums_url = search_albums_url(query, limit, offset)
        const responses = local_http
            .batch()
            .GET(playlists_url.toString(), {}, false)
            .GET(albums_url.toString(), {}, false)
            .execute()

        if (responses[0] === undefined || responses[1] === undefined) {
            throw new ScriptException("unreachable")
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const playlists_response: SearchPlaylistsResponse = JSON.parse(responses[0].body)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const albums_response: SearchPlaylistsResponse = JSON.parse(responses[1].body)


        const results = interleave([
            playlists_response.collection.map(playlist => new PlatformPlaylist(sound_cloud_playlist_to_platform_playlist_def(playlist))),
            albums_response.collection.map(playlist => new PlatformPlaylist(sound_cloud_playlist_to_platform_playlist_def(playlist)))
        ])

        super(results, playlists_response.next_href !== undefined || albums_response.next_href !== undefined)

        this.playlists_next_href = playlists_response.next_href
        this.albums_next_href = albums_response.next_href
    }
    override nextPage(this: PlaylistSearchResultsPager) {
        if (this.playlists_next_href !== undefined && this.albums_next_href !== undefined) {
            const responses = local_http
                .batch()
                .GET(this.playlists_next_href, {}, false)
                .GET(this.albums_next_href, {}, false)
                .execute()

            if (responses[0] === undefined || responses[1] === undefined) {
                throw new ScriptException("unreachable")
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const playlists_response: SearchPlaylistsResponse = JSON.parse(responses[0].body)

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const albums_response: SearchPlaylistsResponse = JSON.parse(responses[1].body)

            this.results = interleave([
                playlists_response.collection.map(
                    playlist => new PlatformPlaylist(sound_cloud_playlist_to_platform_playlist_def(playlist))
                ),
                albums_response.collection.map(
                    playlist => new PlatformPlaylist(sound_cloud_playlist_to_platform_playlist_def(playlist))
                )])
            this.hasMore = playlists_response.next_href !== undefined || albums_response.next_href !== undefined
            this.playlists_next_href = playlists_response.next_href
            this.albums_next_href = albums_response.next_href
        } else if (this.playlists_next_href !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const playlists_response: SearchPlaylistsResponse = JSON.parse(local_http.GET(this.playlists_next_href, {}, false).body)

            this.results = playlists_response.collection.map(
                playlist => new PlatformPlaylist(sound_cloud_playlist_to_platform_playlist_def(playlist)))
            this.hasMore = playlists_response.next_href !== undefined
            this.playlists_next_href = playlists_response.next_href
        } else if (this.albums_next_href !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const albums_response: SearchPlaylistsResponse = JSON.parse(local_http.GET(this.albums_next_href, {}, false).body)

            this.results = albums_response.collection.map(sound_cloud_playlist_to_platform_playlist_def).map(playlist_def => new PlatformPlaylist(playlist_def))
            this.hasMore = albums_response.next_href !== undefined
            this.albums_next_href = albums_response.next_href
        } else {
            throw new ScriptException("unreachable")
        }

        return this
    }
    override hasMorePagers(this: PlaylistSearchResultsPager): boolean {
        return this.hasMore
    }
}
function search_albums(query: string, limit: number, offset: number) {
    const url = search_albums_url(query, limit, offset)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const search_response: SearchPlaylistsResponse = JSON.parse(local_http.GET(url.toString(), {}, true).body)

    return search_response
}
function search_albums_url(query: string, limit: number, offset: number) {
    const url = new URL(`${API_URL}search/albums`)
    url.searchParams.set("q", query)
    url.searchParams.set("client_id", local_state.client_id)
    url.searchParams.set("limit", limit.toString())
    url.searchParams.set("offset", offset.toString())
    url.searchParams.set("linked_partitioning", (1).toString())
    url.searchParams.set("app_version", local_state.app_version.toString())
    url.searchParams.set("app_locale", APP_LOCALE)

    return url
}
function search_playlists(query: string, limit: number, offset: number) {
    const url = search_playlists_url(query, limit, offset)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const search_response: SearchPlaylistsResponse = JSON.parse(local_http.GET(url.toString(), {}, true).body)

    return search_response
}
function search_playlists_url(query: string, limit: number, offset: number) {
    const url = new URL(`${API_URL}search/playlists_without_albums`)
    url.searchParams.set("q", query)
    url.searchParams.set("client_id", local_state.client_id)
    url.searchParams.set("limit", limit.toString())
    url.searchParams.set("offset", offset.toString())
    url.searchParams.set("linked_partitioning", (1).toString())
    url.searchParams.set("app_version", local_state.app_version.toString())

    return url
}
//#endregion

//#region converters
function sound_cloud_user_to_platform_channel(scu: SoundCloudUser) {
    const visuals = scu.visuals?.visuals
    const banner = visuals?.[0]?.visual_url ?? ""

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, scu.id.toString(), plugin.config.id),
        name: scu.username,
        thumbnail: scu.avatar_url,
        banner,
        subscribers: scu.followers_count || 0,
        description: scu.description,
        url: scu.permalink_url,
    })
}

function sound_cloud_track_to_platform_video(sct: SoundCloudTrack) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, sct.id.toString(), plugin.config.id),
        name: sct.title,
        thumbnails: new Thumbnails([new Thumbnail(sct.artwork_url ?? sct.user.avatar_url.replace("large", "t500x500"), HARDCODED_THUMBNAIL_QUALITY)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, sct.user_id.toString(), plugin.config.id),
            sct.user.username,
            sct.user.permalink_url,
            sct.user.avatar_url
        ),
        datetime: date_to_unix_seconds(sct.created_at),
        duration: Math.round(sct.duration / 1000),
        viewCount: sct.playback_count,
        url: sct.permalink_url,
        isLive: false,
        shareUrl: sct.permalink_url,
    })
}
function sound_cloud_playlist_to_platform_playlist_def(scp: SoundCloudPlaylist | SoundCloudSystemPlaylist): IPlatformPlaylistDef {
    const datetime = (() => {
        if (scp.kind === "playlist") {
            return date_to_unix_seconds(scp.display_date)
        } else {
            if (scp.last_updated === null) {
                return undefined
            } else {
                return date_to_unix_seconds(scp.last_updated)
            }
        }
    })()

    const def = {
        id: new PlatformID(PLATFORM, scp.id.toString(), plugin.config.id),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, scp.user.id.toString(), plugin.config.id),
            scp.user.username,
            scp.user.permalink_url,
            scp.user.avatar_url,
            scp.user.followers_count
        ),
        name: scp.title,
        thumbnail: scp.artwork_url,
        videoCount: scp.kind === "playlist" ? scp.track_count : scp.tracks.length,
        url: scp.permalink_url,
    }

    if (datetime === undefined) {
        return def
    } else {
        return { datetime, ...def }
    }
}
function sound_cloud_playlist_to_platform_playlist_details_def(scp: SoundCloudPlaylist | SoundCloudSystemPlaylist): IPlatformPlaylistDetailsDef {
    return {
        ...sound_cloud_playlist_to_platform_playlist_def(scp),
        contents: new PlaylistContentsPager(scp.tracks, 14)
    }
}
class PlaylistContentsPager extends VideoPager {
    constructor(private readonly tracks: SoundCloudTrackMin[], private readonly page_size: number) {
        const tracks_to_load = tracks.splice(0, page_size)

        const url = new URL(`${API_URL}tracks`)
        url.searchParams.set("ids", tracks_to_load.map(track => track.id).join(","))
        url.searchParams.set("client_id", local_state.client_id)
        url.searchParams.set("app_version", local_state.app_version.toString())
        url.searchParams.set("app_locale", APP_LOCALE)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: TracksResponse = JSON.parse(local_http.GET(url.toString(), {}, false).body)

        super(
            tracks_to_load
                .map(track_min => response.find(track => track_min.id === track.id))
                .filter(track => track !== undefined)
                .map(sound_cloud_track_to_platform_video),
            tracks.length > 0
        )
    }
    override nextPage(this: PlaylistContentsPager): PlaylistContentsPager {
        const tracks_to_load = this.tracks.splice(0, this.page_size)

        const url = new URL(`${API_URL}tracks`)
        url.searchParams.set("ids", tracks_to_load.map(track => track.id).join(","))
        url.searchParams.set("client_id", local_state.client_id)
        url.searchParams.set("app_version", local_state.app_version.toString())
        url.searchParams.set("app_locale", APP_LOCALE)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: TracksResponse = JSON.parse(local_http.GET(url.toString(), {}, false).body)

        this.results = tracks_to_load
            .map(track_min => response.find(track => track_min.id === track.id))
            .filter(track => track !== undefined)
            .map(sound_cloud_track_to_platform_video)
        this.hasMore = this.tracks.length > 0
        return this
    }
    override hasMorePagers(this: PlaylistContentsPager): boolean {
        return this.hasMore
    }
}
//#endregion

//#region utilities
/**
 * 
 * @param url SoundCloud channel url
 * @returns 
 */
function extract_sound_cloud_id(url: string) {
    const match = url.match(REGEX_CHANNEL)
    if (match?.[2]) {
        return match[2] // The second capturing group contains the SoundCloud ID
    }

    throw new ScriptException(`failed to extract SoundCloud slug from url: ${url}`)
}

function is_sound_cloud_playlist_url(url: string) {
    return REGEX_CHANNEL_PLAYLIST.test(url) || is_sound_cloud_likes_playlist(url)
}

function is_sound_cloud_likes_playlist(url: string) {
    return REGEX_LIKES_PLAYLIST.test(url)
}

function date_to_unix_seconds(date: string) {
    return Math.round(Date.parse(date) / 1000)
}

function is_premium(track: SoundCloudTrack) {
    return track.monetization_model === "SUB_HIGH_TIER"
}

function resolve_track(url: string): SoundCloudTrack {
    const request_url = new URL(`${API_URL}resolve`)
    request_url.searchParams.set("url", url)
    request_url.searchParams.set("client_id", local_state.client_id)
    request_url.searchParams.set("app_version", local_state.app_version.toString())
    request_url.searchParams.set("app_locale", APP_LOCALE)

    // Get actual numeric track ID from the permalink
    const resp = local_http.GET(request_url.toString(), {}, false)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const track_data: SoundCloudTrack = JSON.parse(resp.body)
    return track_data
}

function extract_track_id(url: string) {
    return resolve_track(url).id
}

function extract_container_and_codec(mime_type: string) {
    const codecRegex = /^(.*?)(|; codecs="(.*?)")$/
    const match = mime_type.match(codecRegex)
    if (match?.[1] === undefined || match[2] === undefined) {
        throw new ScriptException(`unable to determine container and codec for ${mime_type}`)
    }

    return { container: match[1], codec: match[2] }
}
function interleave<T>(arrays: T[][]): T[] {
    const maxLength = Math.max(...arrays.map(arr => arr.length))
    const result: T[] = []
    for (let i = 0; i < maxLength; i++) {
        arrays.forEach((array) => {
            if (i < array.length) {
                const val = array[i]
                if (val === undefined) {
                    throw new ScriptException("unreachable")
                }
                result.push(val)
            }
        })
    }
    return result
}
function assert_exhaustive(value: never): void
function assert_exhaustive(value: never, exception_message: string): ScriptException
function assert_exhaustive(value: never, exception_message?: string): ScriptException | undefined {
    log(["SoundCloud log:", value])
    if (exception_message !== undefined) {
        return new ScriptException(exception_message)
    }
    return
}
function passthrough_log<T>(object: T): T {
    log(object)
    return object
}
//#endregion

console.log(extract_track_id, passthrough_log, search_playlists, search_albums)
// export statements are removed during build step
// used for unit testing in SpotifyScript.test.ts
export { extract_track_id }
