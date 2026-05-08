// ─── TEMPORARY DEBUG: log everything on the subredditInfo object ──
// INSERT THIS BLOCK RIGHT AFTER Promise.all([...]) completes (around line 487)
if (subredditInfo) {
  const info = subredditInfo as any;
  
  // Log all own enumerable keys
  console.log('[SubVault] subredditInfo keys:', Object.keys(info));
  
  // Log the full object - JSON.stringify won't catch prototype methods,
  // so also try spreading into a plain object
  try {
    // Attempt 1: direct stringify
    console.log('[SubVault] subredditInfo JSON:', JSON.stringify(info, null, 2));
  } catch (e) {
    console.log('[SubVault] subredditInfo JSON failed:', String(e));
  }
  
  try {
    // Attempt 2: spread all own properties including non-enumerable
    const allProps: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(info)) {
      try { allProps[key] = (info as any)[key]; } catch {}
    }
    console.log('[SubVault] subredditInfo all own props:', JSON.stringify(allProps, null, 2));
  } catch (e) {
    console.log('[SubVault] allProps failed:', String(e));
  }

  try {
    // Attempt 3: check prototype chain for hidden fields
    const proto = Object.getPrototypeOf(info);
    if (proto) {
      console.log('[SubVault] subredditInfo prototype keys:', Object.getOwnPropertyNames(proto));
    }
  } catch (e) {
    console.log('[SubVault] proto check failed:', String(e));
  }

  // Attempt 4: check specific field names we care about directly
  const fieldsToProbe = [
    'submitText', 'submit_text',
    'submitLinkLabel', 'submit_link_label', 
    'headerTitle', 'header_title',
    'wikiEnabled', 'wiki_enabled',
    'communityAchievements', 'community_achievements_enabled',
    'allowPredictions', 'allow_predictions',
    'spoilersEnabled', 'spoilers_enabled',
    'commentContribution', 'comment_contribution_settings',
    'allowChatPostCreation', 'allow_chat_post_creation',
    'restrictPosting', 'restrict_posting',
    'restrictCommenting', 'restrict_commenting',
    'freeFormReports', 'free_form_reports',
    'originalContentTagEnabled', 'original_content_tag_enabled',
    'shouldArchivePosts', 'should_archive_posts',
    'suggestedCommentSort', 'suggested_comment_sort',
  ];
  
  const probed: Record<string, unknown> = {};
  for (const field of fieldsToProbe) {
    if (field in info || info[field] !== undefined) {
      probed[field] = info[field];
    }
  }
  console.log('[SubVault] subredditInfo probed fields:', JSON.stringify(probed, null, 2));
}
