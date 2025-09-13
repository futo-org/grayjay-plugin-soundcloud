//#region custom types
export type Settings = {
    readonly hide_premium_content: boolean
    readonly preferred_protocol: Protocol
    readonly home_preference: Home
}

export const enum Protocol {
    Progressive = 0,
    HLS = 1,
}

export const enum Home {
    Discover = 0,
    Feed = 1,
    Charts = 2,
}

export type SoundCloudSource = Required<Omit<Source<
    Filters,
    FilterOptions,
    FilterGroups,
    OtherFilters,
    ChannelTypeCapabilities,
    SearchTypes,
    FeedType,
    Settings
>,
    "getSearchChannelContentsCapabilities"
    | "getLiveChatWindow"
    | "getShorts"
    | "searchChannelContents"
    | "getChannelCapabilities"
    | "getSubComments"
    | "getPlaybackTracker"
>>

export type Filters = "DURATION_FILTER" | "DATE_FILTER" | "LICENSE_FILTER"

export type OtherFilters = {
    "DURATION_FILTER"?: [DurationOptions],
    "DATE_FILTER"?: [DateOptions],
    "LICENSE_FILTER"?: [LicenseOptions]
}

export const enum DurationOptions {
    less_than_two = "< 2 min",
    two_to_ten = "2-10 min",
    ten_to_thirty = "10-30 min",
    more_than_thirty = "> 30 min",
}

export const enum DateOptions {
    last_hour = "Last hour",
    today = "Today",
    this_week = "This week",
    this_month = "This month",
    this_year = "This year",
}

export const enum LicenseOptions {
    modify_commercially = "To modify commercially",
    use_commercially = "To use commercially",
    share = "To share"
}

export type FilterOptions = DateOptions | DurationOptions | LicenseOptions
export type FilterGroups = [
    FilterGroup<"DURATION_FILTER", DurationOptions, [
        FilterCapability<DurationOptions.less_than_two>,
        FilterCapability<DurationOptions.two_to_ten>,
        FilterCapability<DurationOptions.ten_to_thirty>,
        FilterCapability<DurationOptions.more_than_thirty>
    ]>,
    FilterGroup<"DATE_FILTER", DateOptions, [
        FilterCapability<DateOptions.last_hour>,
        FilterCapability<DateOptions.today>,
        FilterCapability<DateOptions.this_week>,
        FilterCapability<DateOptions.this_month>,
        FilterCapability<DateOptions.this_year>
    ]>,
    FilterGroup<"LICENSE_FILTER", LicenseOptions, [
        FilterCapability<LicenseOptions.modify_commercially>,
        FilterCapability<LicenseOptions.use_commercially>,
        FilterCapability<LicenseOptions.share>,
    ]>
]

export type SoundCloudFilters = {
    readonly date: "last_hour" | "last_day" | "last_week" | "last_month" | "last_year" | undefined
    readonly duration: "short" | "medium" | "long" | "epic" | undefined
    readonly license: "to_modify_commercially" | "to_use_commercially" | "to_share" | undefined
}

export type State = {
    readonly client_id: string
    readonly app_version: number
    readonly is_premium: boolean
}
export type ChannelTypeCapabilities = typeof Type.Feed.Videos | typeof Type.Feed.Mixed
export type SearchTypes = typeof Type.Feed.Videos | typeof Type.Feed.Mixed
//#endregion

//#region JSON types
export type LinksResponse = {
    readonly title: string
    readonly url: string
}[]

export type LikesResponse = PaginationResponse<{
    readonly track: SoundCloudTrack
} | {
    readonly playlist: unknown
}>

export type FeedResponse = PaginationResponse<{
    readonly type: "track"
    readonly track: SoundCloudTrack
} | {
    readonly type: "track-repost"
    readonly track: SoundCloudTrack
}>

export type PlaylistResponse = PaginationResponse<SoundCloudPlaylist>

export type CommentsResponse = PaginationResponse<SoundCloudComment>

export type HomeResponse = PaginationResponse<{
    readonly items: {
        readonly collection: (SoundCloudSystemPlaylist | SoundCloudPlaylist | SoundCloudUser)[]
    }
}>

export type RelatedTracksResponse = PaginationResponse<SoundCloudTrack>

type PaginationResponse<T> = {
    readonly collection: T[]
    readonly next_href: string | null
}

type SearchResponse<T> = {
    readonly collection: T[]
    readonly next_href?: string
}

export type SoundCloudComment = {
    readonly body: string
    readonly created_at: string
    readonly id: number
    /**
     * time in miliseconds on the track with which the comment is associated
     * used by SoundCloud for reply functionality
    */
    readonly timestamp: number
    readonly user: SoundCloudUser
    readonly track_id: number
}

export type SoundCloudTrack = {
    readonly artwork_url: string | null
    readonly caption?: string
    readonly commentable: boolean
    readonly comment_count: number
    readonly created_at: string
    readonly description: string
    readonly download_count: number
    readonly duration: number
    readonly full_duration: number
    readonly embeddable_by: string
    readonly genre?: string
    readonly has_downloads_left: boolean
    readonly id: number
    readonly kind: "track"
    readonly label_name?: string
    readonly last_modified: string
    readonly license: string
    readonly likes_count: number
    readonly permalink: string
    readonly permalink_url: string
    readonly playback_count: number
    readonly public: boolean
    readonly publisher_metadata?: {
        readonly id: number
        readonly urn: string
        readonly artist: string
        readonly album_title: string
        readonly contains_music: boolean
        readonly upc_or_ean: string
        readonly isrc: string
        readonly explicit: boolean
        readonly p_line: string
        readonly p_line_for_display: string
        readonly c_line: string
        readonly c_line_for_display: string
        readonly release_title: string
    }
    readonly purchase_title?: string
    readonly purchase_url?: string
    readonly release_date?: string
    readonly reposts_count: number
    readonly secret_token?: string
    readonly sharing: string
    readonly state: string
    readonly streamable: boolean
    readonly tag_list: string
    readonly title: string
    readonly track_format: string
    readonly uri: string
    readonly urn: string
    readonly user_id: number
    readonly visuals?: unknown
    readonly waveform_url: string
    readonly display_date: string
    readonly media: {
        readonly transcodings: {
            readonly url: string
            readonly preset: string
            readonly duration: number
            readonly snipped: boolean
            readonly format: {
                readonly protocol: "hls" | "progressive"
                readonly mime_type: string
            }
            readonly quality: "sq" | "hq"
        }[]
    }
    readonly station_urn?: string
    readonly station_permalink?: string
    readonly track_authorization: string
    readonly monetization_model?: "BLACKBOX" | "SUB_HIGH_TIER" | "AD_SUPPORTED"
    readonly policy?: string
    readonly user: SoundCloudUser
}

export type SoundCloudTrackMin = {
    readonly id: number
    readonly kind: string
    readonly monetization_model?: string
}

export type SoundCloudPlaylist = {
    readonly artwork_url: string
    readonly created_at: string
    readonly duration: number
    readonly id: number
    readonly kind: "playlist"
    readonly last_modified: string
    readonly likes_count: number
    readonly managed_by_feeds: boolean
    readonly permalink: string
    readonly permalink_url: string
    readonly public: boolean
    readonly reposts_count: number
    readonly secret_token?: string
    readonly sharing: string
    readonly title: string
    readonly track_count: number
    readonly uri: string
    readonly user_id: number
    readonly set_type: string
    readonly is_album: boolean
    readonly published_at: string
    readonly display_date: string
    readonly user: SoundCloudUser
    readonly tracks: SoundCloudTrackMin[]
}

export type SoundCloudSystemPlaylist = {
    readonly urn: string
    readonly query_urn?: string
    readonly permalink: string
    readonly permalink_url: string
    readonly title: string
    readonly description: string
    readonly short_title: string
    readonly short_description: string
    readonly tracking_feature_name: string
    readonly playlist_type: string
    readonly last_updated: string | null
    readonly artwork_url: string
    readonly calculated_artwork_url: string
    readonly likes_count: number
    readonly seed?: string
    readonly tracks: SoundCloudTrackMin[]
    readonly is_public: boolean
    readonly made_for: {
        readonly urn: string
        readonly permalink: string
        readonly permalink_url: string
        readonly username: string
        readonly avatar_url: string
        readonly kind: string
        readonly uri: string
        readonly last_updated: string
    }
    readonly user: SoundCloudUser
    readonly kind: "system-playlist"
    readonly id: string
}

export type TracksResponse = SoundCloudTrack[]

export type LibraryResponse = PaginationResponse<{
    readonly created_at: string
    readonly type: "playlist"
    readonly user: SoundCloudUser
    readonly uuid: string
    readonly playlist: SoundCloudPlaylist
} | {
    readonly created_at: string
    readonly type: "playlist-like"
    readonly user: SoundCloudUser
    readonly uuid: string
    readonly playlist: SoundCloudPlaylist
} | {
    readonly created_at: string
    readonly type: "system-playlist-like"
    readonly user: SoundCloudUser
    readonly uuid: string
    readonly system_playlist: SoundCloudSystemPlaylist
}>

export type SearchTracksResponse = SearchResponse<SoundCloudTrack>
export type SearchPlaylistsResponse = SearchResponse<SoundCloudPlaylist>
export type SearchUsersResponse = SearchResponse<SoundCloudUser>

export type UserTracksResponse = PaginationResponse<SoundCloudTrack>

export type SearchAutofillResponse = PaginationResponse<{
    readonly query: string
    readonly output: string
}>

export type SCHydration = {
    readonly hydratable: "user"
    readonly data: SoundCloudUser
} | {
    readonly hydratable: "meUser"
    readonly data: SoundCloudUser
} | {
    readonly hydratable: "sound"
    readonly data: SoundCloudTrack
} | {
    readonly hydratable: "systemPlaylist"
    readonly data: SoundCloudSystemPlaylist
} | {
    readonly hydratable: "playlist"
    readonly data: SoundCloudPlaylist
}

export type SoundCloudUser = {
    readonly avatar_url: string
    readonly city?: string
    readonly comments_count: number
    readonly country_code?: string
    readonly created_at: string
    readonly creator_subscriptions: {
        readonly product: {
            readonly id: string
        }
    }[]
    readonly creator_subscription: {
        readonly product: {
            readonly id: string
        }
    }
    readonly description: string
    readonly followers_count: number
    readonly followings_count: number
    readonly first_name: string
    readonly full_name: string
    readonly groups_count: number
    readonly id: number
    readonly kind: "user"
    readonly last_modified: string
    readonly last_name: string
    readonly likes_count: number
    readonly playlist_likes_count: number
    readonly permalink: string
    readonly permalink_url: string
    readonly playlist_count: number
    readonly reposts_count: number
    readonly track_count: number
    readonly uri: string
    readonly urn: string
    readonly username: string
    readonly verified: boolean
    readonly visuals: null | {
        readonly urn: string
        readonly enabled: boolean
        readonly visuals: {
            readonly urn: string
            readonly entry_time: number
            readonly visual_url: string
            readonly link: string
        }[]
        readonly tracking: unknown
    }
    readonly badges: {
        readonly pro: boolean
        readonly pro_unlimited: boolean
        readonly verified: boolean
    }
    readonly station_urn: string
    readonly station_permalink: string
    readonly url: string
}
//#endregion
