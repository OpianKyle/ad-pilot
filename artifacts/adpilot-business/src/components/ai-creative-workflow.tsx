import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import {
  getListAdpilotAssetsQueryKey,
  useCompleteAdpilotAssetUpload,
  useGenerateAdpilotAiCopy,
  useGenerateAdpilotAiImage,
  useGetCsrfToken,
  useRequestAdpilotAssetUpload,
} from '@workspace/api-client-react';
import type {
  AiCreativeCopy,
  AiCreativeImage,
} from '@workspace/api-client-react';
import type { ApprovedAiCreative } from '@/lib/creative-handoff';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function describeError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function csrfHeaders(token: string | undefined): Record<string, string> {
  return token ? { 'X-CSRF-Token': token } : {};
}

function imageBlob(image: AiCreativeImage): Blob {
  const binary = window.atob(image.imageBase64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([buffer], { type: image.mimeType });
}

export default function AiCreativeWorkflow({
  onApproved,
}: {
  onApproved: (creative: ApprovedAiCreative) => void;
}) {
  const queryClient = useQueryClient();
  const csrf = useGetCsrfToken({ request: { credentials: 'include' } });
  const secureRequest = {
    credentials: 'include' as const,
    headers: csrfHeaders(csrf.data?.csrf),
  };
  const copyMutation = useGenerateAdpilotAiCopy({ request: secureRequest });
  const imageMutation = useGenerateAdpilotAiImage({ request: secureRequest });
  const requestUpload = useRequestAdpilotAssetUpload({ request: secureRequest });
  const completeUpload = useCompleteAdpilotAssetUpload({ request: secureRequest });

  const [brief, setBrief] = useState({
    businessContext: '',
    audience: '',
    goal: 'Build awareness',
    tone: 'Warm, clear, and human',
    offer: '',
  });
  const [creative, setCreative] = useState<AiCreativeCopy | null>(null);
  const [image, setImage] = useState<AiCreativeImage | null>(null);
  const [imageApproved, setImageApproved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const imageUrl = useMemo(
    () => image ? `data:${image.mimeType};base64,${image.imageBase64}` : '',
    [image],
  );

  async function draftCopy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setImage(null);
    setImageApproved(false);
    try {
      const result = await copyMutation.mutateAsync({
        data: {
          businessContext: brief.businessContext.trim(),
          audience: brief.audience.trim(),
          goal: brief.goal.trim(),
          tone: brief.tone.trim(),
          offer: brief.offer.trim(),
        },
      });
      setCreative(result);
    } catch (requestError) {
      setError(describeError(requestError, 'Gemini could not draft the copy. Try again.'));
    }
  }

  async function generateImage() {
    if (!creative) return;
    setError('');
    setImage(null);
    setImageApproved(false);
    try {
      const result = await imageMutation.mutateAsync({
        data: { prompt: creative.imagePrompt.trim() },
      });
      setImage(result);
    } catch (requestError) {
      setError(describeError(requestError, 'The photo could not be generated. Try again.'));
    }
  }

  async function approveAndContinue() {
    if (!creative || !image || !imageApproved || !csrf.data?.csrf) return;
    setSaving(true);
    setError('');
    try {
      const file = imageBlob(image);
      if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
        throw new Error('This generated photo is larger than the planner limit.');
      }
      const upload = await requestUpload.mutateAsync({
        data: {
          name: 'AI-generated social photo.jpg',
          size: file.size,
          contentType: 'image/jpeg',
        },
      });
      const transfer = await fetch(upload.uploadUrl, {
        method: 'PUT',
        credentials: 'omit',
        headers: { 'Content-Type': 'image/jpeg' },
        body: file,
      });
      if (!transfer.ok) {
        throw new Error(`Photo transfer failed (${transfer.status}). Try again.`);
      }
      const asset = await completeUpload.mutateAsync({
        id: upload.id,
        data: {
          title: 'AI-generated social photo',
          rightsConfirmed: true,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListAdpilotAssetsQueryKey(),
      });
      onApproved({
        caption: creative.caption.trim(),
        hashtags: creative.hashtags.trim(),
        assetId: asset.id,
      });
    } catch (requestError) {
      setError(describeError(requestError, 'The approved photo could not be added to the planner.'));
    } finally {
      setSaving(false);
    }
  }

  const pending =
    copyMutation.isPending ||
    imageMutation.isPending ||
    saving ||
    requestUpload.isPending ||
    completeUpload.isPending;

  return (
    <section className="apw-panel" data-testid="ai-creative-workflow">
      <div className="apw-panel-head apw-panel-head-lined">
        <div>
          <div className="apw-overline">GEMINI COPY · CLOUDFLARE PHOTO</div>
          <h2>Build a post, then review it.</h2>
        </div>
        <span className="apw-setup-step">APPROVAL REQUIRED</span>
      </div>

      <div className="p-5 md:p-7">
        <p className="max-w-3xl text-sm leading-6 text-[#72777b]">
          Gemini drafts editable copy. Workers AI makes a photo. Nothing is saved to
          the business library or published until you review and approve it.
        </p>

        <form onSubmit={(event) => void draftCopy(event)} className="mt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-xs font-semibold text-[#414c50]">
              Business or product
              <textarea
                required
                minLength={2}
                maxLength={400}
                rows={3}
                value={brief.businessContext}
                onChange={(event) => setBrief((value) => ({ ...value, businessContext: event.target.value }))}
                placeholder="What do you offer? Include only facts you want the post to use."
                className="apw-input apw-textarea mt-2 w-full"
                data-testid="input-ai-business-context"
              />
            </label>
            <label className="block text-xs font-semibold text-[#414c50]">
              Intended audience
              <textarea
                required
                minLength={2}
                maxLength={300}
                rows={3}
                value={brief.audience}
                onChange={(event) => setBrief((value) => ({ ...value, audience: event.target.value }))}
                placeholder="Who is this post for?"
                className="apw-input apw-textarea mt-2 w-full"
                data-testid="input-ai-audience"
              />
            </label>
            <label className="block text-xs font-semibold text-[#414c50]">
              Post goal
              <select
                value={brief.goal}
                onChange={(event) => setBrief((value) => ({ ...value, goal: event.target.value }))}
                className="apw-input mt-2 w-full"
                data-testid="select-ai-goal"
              >
                <option>Build awareness</option>
                <option>Start conversations</option>
                <option>Share useful information</option>
                <option>Promote an offer</option>
                <option>Drive website visits</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-[#414c50]">
              Tone
              <input
                required
                minLength={2}
                maxLength={120}
                value={brief.tone}
                onChange={(event) => setBrief((value) => ({ ...value, tone: event.target.value }))}
                className="apw-input mt-2 w-full"
                data-testid="input-ai-tone"
              />
            </label>
            <label className="block text-xs font-semibold text-[#414c50] md:col-span-2">
              Offer or call to action <span className="font-normal text-[#858b8b]">Optional</span>
              <input
                maxLength={300}
                value={brief.offer}
                onChange={(event) => setBrief((value) => ({ ...value, offer: event.target.value }))}
                placeholder="Leave blank if there is no specific offer."
                className="apw-input mt-2 w-full"
                data-testid="input-ai-offer"
              />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="apw-button apw-button-primary"
              disabled={pending || !csrf.data?.csrf}
              data-testid="button-ai-draft-copy"
            >
              {copyMutation.isPending ? <LoaderCircle className="animate-spin" size={15} /> : <Sparkles size={15} />}
              {copyMutation.isPending ? 'Drafting copy…' : creative ? 'Draft copy again' : 'Draft copy with Gemini'}
            </button>
            {!csrf.data?.csrf && <span className="text-xs text-[#858b8b]">Secure workspace check is loading.</span>}
          </div>
        </form>

        {creative && (
          <div className="mt-7 grid gap-6 border-t border-[#e8e4da] pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)]">
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-[#414c50]">
                Caption <span className="font-normal text-[#858b8b]">{creative.caption.length}/2,200</span>
                <textarea
                  rows={7}
                  maxLength={2200}
                  value={creative.caption}
                  onChange={(event) => setCreative((value) => value ? { ...value, caption: event.target.value } : value)}
                  className="apw-input apw-textarea mt-2 w-full"
                  data-testid="input-ai-caption"
                />
              </label>
              <label className="block text-xs font-semibold text-[#414c50]">
                Hashtags <span className="font-normal text-[#858b8b]">Optional</span>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={creative.hashtags}
                  onChange={(event) => setCreative((value) => value ? { ...value, hashtags: event.target.value } : value)}
                  className="apw-input apw-textarea mt-2 w-full"
                  data-testid="input-ai-hashtags"
                />
              </label>
              <label className="block text-xs font-semibold text-[#414c50]">
                Visual direction
                <textarea
                  rows={4}
                  minLength={10}
                  maxLength={1600}
                  value={creative.imagePrompt}
                  onChange={(event) => {
                    setCreative((value) => value ? { ...value, imagePrompt: event.target.value } : value);
                    setImage(null);
                    setImageApproved(false);
                  }}
                  className="apw-input apw-textarea mt-2 w-full"
                  data-testid="input-ai-image-prompt"
                />
              </label>
              <button
                type="button"
                onClick={() => void generateImage()}
                className="apw-button apw-button-secondary"
                disabled={pending || creative.imagePrompt.trim().length < 10 || !csrf.data?.csrf}
                data-testid="button-ai-generate-image"
              >
                {imageMutation.isPending ? <LoaderCircle className="animate-spin" size={15} /> : image ? <RefreshCw size={15} /> : <WandSparkles size={15} />}
                {imageMutation.isPending ? 'Creating photo…' : image ? 'Regenerate photo' : 'Generate photo with Workers AI'}
              </button>
            </div>

            <div className="space-y-4">
              {image ? (
                <div className="overflow-hidden rounded-xl border border-[#e4e0d6] bg-[#f7f5ef]">
                  <img
                    src={imageUrl}
                    alt="AI-generated social photo awaiting review"
                    className="mx-auto max-h-[440px] w-full object-contain"
                    data-testid="image-ai-generated-preview"
                  />
                  <div className="flex items-center gap-2 border-t border-[#e4e0d6] px-4 py-3 text-xs text-[#687275]">
                    <ImagePlus size={14} /> AI-generated JPEG · review before use
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[#d8d4c9] bg-[#f8f7f2] px-6 text-center text-[#788080]">
                  {imageMutation.isPending ? <LoaderCircle className="mb-3 animate-spin" size={24} /> : <ImagePlus className="mb-3" size={23} />}
                  <strong className="text-sm font-semibold text-[#414c50]">
                    {imageMutation.isPending ? 'Creating your photo' : 'Photo preview'}
                  </strong>
                  <span className="mt-1 max-w-[260px] text-xs leading-5">
                    {imageMutation.isPending ? 'This may take a short while.' : 'Generate an image to review it here before saving.'}
                  </span>
                </div>
              )}

              {image && (
                <>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e4e0d6] bg-white p-3 text-xs leading-5 text-[#596367]">
                    <input
                      type="checkbox"
                      checked={imageApproved}
                      onChange={(event) => setImageApproved(event.target.checked)}
                      className="mt-1 accent-[#178366]"
                      data-testid="checkbox-ai-image-approval"
                    />
                    <span>I reviewed the edited copy and AI-generated photo, and approve adding the photo to this business’s library and moving both into the planner.</span>
                  </label>
                  <p className="text-xs leading-5 text-[#72777b]">
                    Approval fills the business-scoped planner. It does not publish or schedule the post.
                  </p>
                  <button
                    type="button"
                    onClick={() => void approveAndContinue()}
                    className="apw-button apw-button-primary"
                    disabled={!imageApproved || saving || !creative.caption.trim() || !csrf.data?.csrf}
                    data-testid="button-ai-approve-and-open-planner"
                  >
                    {saving || requestUpload.isPending || completeUpload.isPending
                      ? <LoaderCircle className="animate-spin" size={15} />
                      : <><ShieldCheck size={15} /><ArrowRight size={15} /></>}
                    {saving || requestUpload.isPending || completeUpload.isPending ? 'Adding approved photo…' : 'Approve draft and open planner'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-[#e7c7ba] bg-[#fff4ee] px-4 py-3 text-sm text-[#99573b]" role="alert" data-testid="status-ai-workflow-error">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </section>
  );
}
