import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://YOUR_PROJECT_ID.supabase.co'
const supabaseAnonKey = 'YOUR_ANON_KEY'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 1. 客户端设备标识生成（用于基础防刷）
function getVoterIdentity() {
  let id = localStorage.getItem('voter_uuid')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('voter_uuid', id)
  }
  return id
}

// 2. 投票触发方法
async function handleVote(matchId, characterId) {
  const voterId = getVoterIdentity()
  const { data, error } = await supabase.rpc('submit_vote', {
    p_match_id: matchId,
    p_character_id: characterId,
    p_voter_identity: voterId
  })
  
  if (error) alert('投票失败：' + error.message)
  else alert(data.message)
}

// 3. 开启 Realtime 实时订阅（票数跳动核心代码）
function subscribeToVotes(matchId, onUpdateCallback) {
  supabase
    .channel('realtime-votes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'match_candidates',
        filter: `match_id=eq.${matchId}`
      },
      (payload) => {
        // payload.new 包含了最新的 votes 票数，直接更新前端视图/PK进度条
        onUpdateCallback(payload.new)
      }
    )
    .subscribe()
}