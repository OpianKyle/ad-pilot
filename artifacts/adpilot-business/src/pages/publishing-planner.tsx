import { useMemo, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarClock,
  Check,
  Clock3,
  Facebook,
  ImagePlus,
  Instagram,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  getGetAdpilotMetaConnectionQueryKey,
  getListAdpilotAssetsQueryKey,
  getListAdpilotScheduledPostsQueryKey,
  useCancelAdpilotScheduledPost,
  useCompleteAdpilotAssetUpload,
  useCreateAdpilotScheduledPost,
  useGetAdpilotMetaConnection,
  useGetCsrfToken,
  useListAdpilotAssets,
  useListAdpilotScheduledPosts,
  useRequestAdpilotAssetUpload,
} from '@workspace/api-client-react';
import type { MediaAsset, ScheduledPost, ScheduledPostInput } from '@workspace/api-client-react';
import { Link } from 'wouter';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png'] as const;

type PostFilter = 'all' | 'queued' | 'publishing' | 'published' | 'attention' | 'cancelled';

function describeError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function csrfHeaders(token: string | undefined): Record<string, string> {
  return token ? { 'X-CSRF-Token': token } : {};
}

function stateGroup(post: ScheduledPost): PostFilter {
  const status = String(post.status).toLowerCase();
  const channelStates = [post.facebookState, post.instagramState].filter(Boolean).map((state) => String(state).toLowerCase());
  if (status === 'cancelled') return 'cancelled';
  if (status === 'publishing' || channelStates.includes('publishing')) return 'publishing';
  if (status === 'published') return 'published';
  if (status === 'needs_attention' || status === 'failed' || Boolean(post.error) || channelStates.some((state) => state === 'failed' || state === 'needs_attention')) return 'attention';
  return 'queued';
}

function statusName(post: ScheduledPost) {
  const status = String(post.status).replaceAll('_', ' ');
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function prettyTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function PublishingPlannerPage() {
  const queryClient = useQueryClient();
  const csrf = useGetCsrfToken({ request: { credentials: 'include' } });
  const connection = useGetAdpilotMetaConnection({ request: { credentials: 'include' } });
  const assets = useListAdpilotAssets({ request: { credentials: 'include' } });
  const posts = useListAdpilotScheduledPosts({
    request: { credentials: 'include' },
    query: { queryKey: getListAdpilotScheduledPostsQueryKey(), refetchInterval: 15000 },
  });
  const secureRequest = {
    credentials: 'include' as const,
    headers: csrfHeaders(csrf.data?.csrf),
  };
  const requestUpload = useRequestAdpilotAssetUpload({ request: secureRequest });
  const completeUpload = useCompleteAdpilotAssetUpload({ request: secureRequest });
  const createPost = useCreateAdpilotScheduledPost({ request: secureRequest });
  const cancelPost = useCancelAdpilotScheduledPost({ request: secureRequest });
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [facebookSelected, setFacebookSelected] = useState(false);
  const [instagramSelected, setInstagramSelected] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState(() => localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [filter, setFilter] = useState<PostFilter>('all');

  const destination = connection.data;
  const canFacebook = Boolean(destination?.connected && destination.facebookPageId);
  const canInstagram = Boolean(destination?.connected && destination.instagramAccountId);
  const assetList = assets.data?.assets ?? [];
  const postList = posts.data?.posts ?? [];
  const selectedAsset = assetList.find((asset) => asset.id === selectedAssetId);
  const counts = useMemo(() => ({
    all: postList.length,
    queued: postList.filter((post) => stateGroup(post) === 'queued').length,
    publishing: postList.filter((post) => stateGroup(post) === 'publishing').length,
    published: postList.filter((post) => stateGroup(post) === 'published').length,
    attention: postList.filter((post) => stateGroup(post) === 'attention').length,
    cancelled: postList.filter((post) => stateGroup(post) === 'cancelled').length,
  }), [postList]);
  const visiblePosts = useMemo(() => {
    const filtered = filter === 'all' ? postList : postList.filter((post) => stateGroup(post) === filter);
    return [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [filter, postList]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setUploadError('');
    setNotice('');
    if (!file) return;
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setUploadFile(null);
      setUploadError('Choose a JPEG or PNG photo.');
      event.target.value = '';
      return;
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      setUploadFile(null);
      setUploadError('The photo must be no larger than 5 MB.');
      event.target.value = '';
      return;
    }
    setUploadFile(file);
    setRightsConfirmed(false);
    event.target.value = '';
  }

  async function uploadSelectedPhoto() {
    if (!uploadFile || !rightsConfirmed || !csrf.data?.csrf) return;
    setUploadBusy(true);
    setUploadError('');
    setNotice('');
    try {
      const upload = await requestUpload.mutateAsync({
        data: { name: uploadFile.name.slice(0, 180), size: uploadFile.size, contentType: uploadFile.type as 'image/jpeg' | 'image/png' },
      });
      const putResult = await fetch(upload.uploadUrl, {
        method: 'PUT',
        credentials: 'omit',
        headers: { 'Content-Type': uploadFile.type },
        body: uploadFile,
      });
      if (!putResult.ok) throw new Error(`Photo transfer failed (${putResult.status}). Please try again.`);
      const asset = await completeUpload.mutateAsync({
        id: upload.id,
        data: { title: uploadFile.name.slice(0, 120), rightsConfirmed: true },
      });
      setSelectedAssetId(asset.id);
      setUploadFile(null);
      setRightsConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: getListAdpilotAssetsQueryKey() });
      setNotice('Photo added to this business’s library and selected for your post.');
    } catch (error) {
      setUploadError(describeError(error, 'The photo could not be uploaded. Try again.'));
    } finally {
      setUploadBusy(false);
    }
  }

  async function refreshPlanner() {
    await Promise.all([
      posts.refetch(),
      assets.refetch(),
      connection.refetch(),
    ]);
  }

  function submitPost(mode: 'now' | 'scheduled') {
    setFormError('');
    setNotice('');
    const trimmedCaption = caption.trim();
    const trimmedHashtags = hashtags.trim();
    const platforms: ScheduledPostInput['platforms'] = [];
    if (facebookSelected && canFacebook) platforms.push('facebook');
    if (instagramSelected && canInstagram) platforms.push('instagram');
    if (!trimmedCaption) return setFormError('Add a caption before creating the post.');
    if (trimmedCaption.length > 2200) return setFormError('Captions must be 2,200 characters or fewer.');
    if (trimmedHashtags.length > 1000) return setFormError('Hashtags must be 1,000 characters or fewer.');
    if (!selectedAssetId || !selectedAsset) return setFormError('Choose a photo from this business’s library.');
    if (!platforms.length) return setFormError('Choose at least one connected publishing destination.');
    if (!csrf.data?.csrf) return setFormError('Secure publishing is not ready yet. Retry the security check.');

    let scheduledAt = new Date().toISOString();
    if (mode === 'scheduled') {
      const localDate = new Date(scheduledLocal);
      if (!scheduledLocal || Number.isNaN(localDate.getTime())) return setFormError('Choose a valid local date and time.');
      if (localDate.getTime() <= Date.now()) return setFormError('Choose a schedule time in the future.');
      scheduledAt = localDate.toISOString();
    }

    const input: ScheduledPostInput = {
      caption: trimmedCaption,
      hashtags: trimmedHashtags,
      assetId: selectedAssetId,
      scheduledAt,
      platforms,
    };
    createPost.mutate({ data: input }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListAdpilotScheduledPostsQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getGetAdpilotMetaConnectionQueryKey() });
        setNotice(mode === 'now' ? 'Post added to the publishing queue. It may take up to 15 seconds to begin.' : 'Post scheduled for your selected local time.');
        setCaption('');
        setHashtags('');
      },
      onError: (error) => setFormError(describeError(error, 'The post could not be created. Please try again.')),
    });
  }

  function cancelScheduledPost(post: ScheduledPost) {
    if (!window.confirm('Cancel this scheduled post? It will remain in your publishing history as cancelled.')) return;
    cancelPost.mutate({ id: post.id }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListAdpilotScheduledPostsQueryKey() });
        setNotice('Scheduled post cancelled.');
      },
      onError: (error) => setFormError(describeError(error, 'This post could not be cancelled.')),
    });
  }

  const isCreating = createPost.isPending;
  const isUploading = uploadBusy || requestUpload.isPending || completeUpload.isPending;
  const connectionBusy = connection.isLoading || assets.isLoading;

  return (
    <section className="apw-page apw-page-enter apw-planner" data-testid="page-publishing-planner">
      <div className="apw-heading">
        <div>
          <div className="apw-eyebrow"><span />A clear route from idea to post</div>
          <h1>Publishing planner.</h1>
          <p>Compose a photo post and send it only to this business’s saved Facebook Page and linked Instagram account.</p>
        </div>
        <div className="apw-heading-actions">
          <button className="apw-button apw-button-secondary" onClick={() => void refreshPlanner()} disabled={connectionBusy || posts.isFetching} data-testid="button-refresh-planner">
            {posts.isFetching ? <LoaderCircle className="animate-spin" size={14} /> : <RefreshCw size={14} />} Refresh records
          </button>
        </div>
      </div>

      {(notice || formError) && (
        <div className={`apw-planner-notice ${formError ? 'apw-planner-notice-error' : ''}`} role={formError ? 'alert' : 'status'} data-testid={formError ? 'status-planner-error' : 'status-planner-notice'}>
          {formError ? <AlertCircle size={17} /> : <ShieldCheck size={17} />}
          <span>{formError || notice}</span>
          <button onClick={() => { setFormError(''); setNotice(''); }} aria-label="Dismiss message" data-testid="button-dismiss-planner-notice">×</button>
        </div>
      )}

      <div className="apw-planner-layout">
        <div className="apw-planner-main">
          <section className="apw-panel apw-compose-panel">
            <div className="apw-panel-head">
              <div><div className="apw-overline">NEW PHOTO POST</div><h2>Make this one count.</h2></div>
              <span className="apw-compose-step">01 / COMPOSE</span>
            </div>
            <div className="apw-compose-body">
              <div className="apw-compose-grid">
                <div className="apw-photo-column">
                  <div className="apw-compose-label"><ImagePlus size={15} /> Photo</div>
                  {selectedAsset ? (
                    <div className="apw-selected-photo" data-testid="selected-photo">
                      <img src={selectedAsset.imageUrl} alt={selectedAsset.title} />
                      <div className="apw-photo-selected-tag"><Check size={12} /> Selected</div>
                      <div className="apw-photo-meta"><strong>{selectedAsset.title}</strong><button onClick={() => setSelectedAssetId('')} aria-label="Remove selected photo" data-testid="button-remove-selected-photo"><Trash2 size={14} /></button></div>
                    </div>
                  ) : (
                    <div className="apw-photo-empty"><ImagePlus size={22} /><strong>Choose a business photo</strong><span>Select from your library or upload a new image.</span></div>
                  )}
                  <div className="apw-upload-controls">
                    <label className="apw-upload-picker">
                      <Upload size={14} /> Choose JPEG or PNG
                      <input type="file" accept="image/jpeg,image/png" onChange={choosePhoto} disabled={isUploading} data-testid="input-photo-upload" />
                    </label>
                    <span>5 MB max</span>
                  </div>
                  {uploadFile && (
                    <div className="apw-upload-confirm">
                      <div className="apw-upload-file"><strong>{uploadFile.name}</strong><span>{(uploadFile.size / 1024 / 1024).toFixed(2)} MB · {uploadFile.type === 'image/png' ? 'PNG' : 'JPEG'}</span></div>
                      <label className="apw-rights-check">
                        <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} data-testid="checkbox-photo-rights" />
                        <span>I own this photo or have permission to use and publish it for this business.</span>
                      </label>
                      <button className="apw-button apw-button-primary" onClick={() => void uploadSelectedPhoto()} disabled={!rightsConfirmed || isUploading || !csrf.data?.csrf} data-testid="button-upload-photo">
                        {isUploading ? <LoaderCircle className="animate-spin" size={14} /> : <Upload size={14} />}
                        {isUploading ? 'Uploading photo' : 'Upload and select'}
                      </button>
                    </div>
                  )}
                  {uploadError && <p className="apw-inline-error" role="alert" data-testid="status-upload-error">{uploadError}</p>}
                  <div className="apw-library">
                    <div className="apw-library-heading"><span>BUSINESS PHOTO LIBRARY</span><span>{assets.isLoading ? 'Loading' : `${assetList.length} photos`}</span></div>
                    {assets.isLoading ? <div className="apw-library-skeleton"><i /><i /><i /></div> : assets.isError ? (
                      <div className="apw-inline-load-error" role="alert"><span>{describeError(assets.error, 'The photo library did not load.')}</span><button onClick={() => void assets.refetch()} data-testid="button-retry-assets">Retry</button></div>
                    ) : assetList.length ? (
                      <div className="apw-asset-grid">
                        {assetList.map((asset) => <AssetTile key={asset.id} asset={asset} selected={asset.id === selectedAssetId} onSelect={() => setSelectedAssetId(asset.id)} />)}
                      </div>
                    ) : (
                      <div className="apw-library-empty"><ImagePlus size={17} /><span>Your library is empty. Upload a photo you have rights to use.</span></div>
                    )}
                  </div>
                </div>

                <div className="apw-post-fields">
                  <label className="field-label">Caption <span className="apw-field-count">{caption.length}/2,200</span>
                    <textarea rows={7} maxLength={2200} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Write a clear, human caption for your customers." className="form-input apw-caption-input" data-testid="input-post-caption" />
                  </label>
                  <label className="field-label">Hashtags <span className="apw-optional-label">Optional</span>
                    <textarea rows={2} maxLength={1000} value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="#yourbusiness #goodnews" className="form-input apw-hashtags-input" data-testid="input-post-hashtags" />
                  </label>
                  <div className="apw-destination-section">
                    <div className="apw-compose-label">Publish to</div>
                    {connection.isLoading ? <div className="apw-destination-loading"><i /> Checking saved destinations</div> : connection.isError ? (
                      <div className="apw-destination-warning" role="alert">
                        <span>{describeError(connection.error, 'Connection status unavailable.')}</span>
                        <button onClick={() => void connection.refetch()} data-testid="button-retry-connection">Retry</button>
                      </div>
                    ) : !destination?.connected ? (
                      <div className="apw-destination-warning">Connect this business’s Meta account before publishing. <Link href="/connections">Connect Meta</Link></div>
                    ) : (
                      <div className="apw-channel-options">
                        <label className={`apw-channel-option ${canFacebook ? '' : 'is-disabled'}`}>
                          <input type="checkbox" checked={facebookSelected && canFacebook} onChange={(event) => setFacebookSelected(event.target.checked)} disabled={!canFacebook} data-testid="checkbox-publish-facebook" />
                          <span className="apw-option-logo facebook"><Facebook size={16} /></span>
                          <span><strong>Facebook Page</strong><small>{canFacebook ? destination.facebookPageName : 'No Page selected'}</small></span>
                          {canFacebook && <i className="apw-option-ready" />}
                        </label>
                        <label className={`apw-channel-option ${canInstagram ? '' : 'is-disabled'}`}>
                          <input type="checkbox" checked={instagramSelected && canInstagram} onChange={(event) => setInstagramSelected(event.target.checked)} disabled={!canInstagram} data-testid="checkbox-publish-instagram" />
                          <span className="apw-option-logo instagram"><Instagram size={16} /></span>
                          <span><strong>Instagram</strong><small>{canInstagram ? destination.instagramUsername ? `@${destination.instagramUsername}` : 'Professional account connected' : 'No linked account selected'}</small></span>
                          {canInstagram && <i className="apw-option-ready" />}
                        </label>
                        {!canFacebook && !canInstagram && <Link className="apw-text-action" href="/connections">Choose business destinations <span>→</span></Link>}
                      </div>
                    )}
                  </div>
                  <div className="apw-schedule-control">
                    <label className="field-label" htmlFor="post-scheduled-at"><span className="flex items-center gap-2"><CalendarClock size={14} /> Schedule for local time</span>
                      <input id="post-scheduled-at" type="datetime-local" value={scheduledLocal} onChange={(event) => setScheduledLocal(event.target.value)} className="form-input" data-testid="input-scheduled-at" />
                    </label>
                    <span>Your device’s local timezone is converted before saving.</span>
                  </div>
                  <div className="apw-compose-actions">
                    <button className="apw-button apw-button-secondary" onClick={() => submitPost('scheduled')} disabled={isCreating || !csrf.data?.csrf} data-testid="button-schedule-post">
                      {isCreating ? <LoaderCircle className="animate-spin" size={14} /> : <Clock3 size={14} />} Schedule post
                    </button>
                    <button className="apw-button apw-button-primary" onClick={() => submitPost('now')} disabled={isCreating || !csrf.data?.csrf} data-testid="button-publish-now">
                      {isCreating ? <LoaderCircle className="animate-spin" size={14} /> : <Send size={14} />} Post now
                    </button>
                  </div>
                  {csrf.isError && <div className="apw-inline-load-error" role="alert"><span>Secure publishing setup failed.</span><button onClick={() => void csrf.refetch()} data-testid="button-retry-publish-csrf">Retry security check</button></div>}
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="apw-planner-aside">
          <div className="apw-planner-aside-card">
            <div className="apw-overline">PUBLISHING FLOW</div>
            <h2>One business.<br />Its own audience.</h2>
            <p>Your saved Page and linked professional Instagram account are the only places available here.</p>
            <Link href="/connections">Manage Meta connection <span>→</span></Link>
            <div className="apw-planner-aside-orbit" />
          </div>
          <div className="apw-planner-tip"><ShieldCheck size={16} /><p>Uploads stay tied to this business. Confirm rights before adding a photo to its library.</p></div>
        </aside>
      </div>

      <section className="apw-posts-section" data-testid="section-post-history">
        <div className="apw-posts-heading">
          <div><div className="apw-overline">BUSINESS POST RECORDS</div><h2>The publishing table</h2><p>Queue and delivery states come directly from this business’s server records.</p></div>
          <div className="apw-post-count"><strong>{counts.all}</strong><span>total posts</span></div>
        </div>
        <div className="apw-post-filters" role="tablist" aria-label="Filter posts">
          {([
            ['all', 'All posts'],
            ['queued', 'Queued / scheduled'],
            ['publishing', 'Publishing'],
            ['published', 'Published'],
            ['attention', 'Needs attention'],
            ['cancelled', 'Cancelled'],
          ] as [PostFilter, string][]).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)} data-testid={`filter-posts-${key}`}>
              {label}<span>{counts[key]}</span>
            </button>
          ))}
        </div>
        {posts.isLoading ? (
          <div className="apw-panel apw-post-list-skeleton" role="status" aria-label="Loading post records"><i /><i /><i /></div>
        ) : posts.isError ? (
          <div className="apw-panel apw-posts-error" role="alert" data-testid="status-posts-error">
            <AlertCircle size={20} /><div><strong>Post records did not load.</strong><p>{describeError(posts.error, 'The server could not return this business’s posts.')}</p></div>
            <button onClick={() => void posts.refetch()} className="apw-button apw-button-secondary" data-testid="button-retry-posts"><RefreshCw size={14} /> Try again</button>
          </div>
        ) : visiblePosts.length ? (
          <div className="apw-post-list">
            {visiblePosts.map((post) => <PostRecord key={post.id} post={post} cancelling={cancelPost.isPending && cancelPost.variables?.id === post.id} onCancel={() => cancelScheduledPost(post)} />)}
          </div>
        ) : (
          <div className="apw-panel apw-posts-empty" data-testid="empty-post-records">
            <div className="apw-empty-icon"><CalendarClock size={21} /></div>
            <h3>{filter === 'all' ? 'Your queue is clear.' : `No ${filter === 'attention' ? 'posts needing attention' : filter === 'queued' ? 'queued or scheduled posts' : `${filter} posts`} yet.`}</h3>
            <p>{filter === 'all' ? 'New posts created for this business will appear here with live delivery states.' : 'Try another status filter to review the rest of this business’s publishing history.'}</p>
            {filter !== 'all' && <button onClick={() => setFilter('all')} data-testid="button-clear-post-filter">View all posts</button>}
          </div>
        )}
      </section>
    </section>
  );
}

function AssetTile({ asset, selected, onSelect }: { asset: MediaAsset; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`apw-asset-tile ${selected ? 'is-selected' : ''}`} onClick={onSelect} aria-pressed={selected} title={`Use ${asset.title}`} data-testid={`asset-${asset.id}`}>
      <img src={asset.imageUrl} alt="" loading="lazy" />
      <span>{selected ? <Check size={12} /> : asset.title}</span>
    </button>
  );
}

function PostRecord({ post, cancelling, onCancel }: { post: ScheduledPost; cancelling: boolean; onCancel: () => void }) {
  const group = stateGroup(post);
  const canCancel = group === 'queued' && ['scheduled', 'queued'].includes(String(post.status).toLowerCase());
  const destinationState = (platform: 'facebook' | 'instagram') => {
    if (!post.platforms.includes(platform)) return 'Not selected';
    const state = platform === 'facebook' ? post.facebookState : post.instagramState;
    return state || (post.status === 'scheduled' ? 'Scheduled' : statusName(post));
  };
  return (
    <article className={`apw-post-record apw-post-${group}`} data-testid={`post-record-${post.id}`}>
      <div className="apw-post-image"><img src={post.imageUrl} alt="" loading="lazy" /></div>
      <div className="apw-post-copy">
        <div className="apw-post-meta-line"><span className={`apw-post-status apw-post-status-${group}`}><i />{statusName(post)}</span><time>{prettyTime(post.scheduledAt)}</time></div>
        <p>{post.caption}</p>
        {post.hashtags && <div className="apw-post-hashtags">{post.hashtags}</div>}
        <div className="apw-post-destinations">
          <span className={post.platforms.includes('facebook') ? 'is-included' : ''}><Facebook size={12} /> Facebook · {destinationState('facebook')}</span>
          <span className={post.platforms.includes('instagram') ? 'is-included' : ''}><Instagram size={12} /> Instagram · {destinationState('instagram')}</span>
        </div>
        {(post.error || group === 'attention') && <div className="apw-post-error" role="status"><AlertCircle size={13} />{post.error || 'Delivery needs attention. Review the channel states or reconnect Meta.'}</div>}
      </div>
      {canCancel && (
        <button className="apw-post-cancel" onClick={onCancel} disabled={cancelling} data-testid={`button-cancel-post-${post.id}`}>
          {cancelling ? <LoaderCircle className="animate-spin" size={14} /> : <Trash2 size={14} />} Cancel
        </button>
      )}
    </article>
  );
}
