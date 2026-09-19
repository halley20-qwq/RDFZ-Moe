import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nszewgdsqxqcegsdwdvq.supabase.co/rest/v1/'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zemV3Z2RzcXhxY2Vnc2R3ZHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4MTI3NDUsImV4cCI6MjEwNTM4ODc0NX0.Js6XgYlVgZdbCHsNvnbp5K7Q_rSl_pS6EBv-lGtNykY'
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