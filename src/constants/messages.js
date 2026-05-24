export const COMBINED_LANGUAGE_HELP_TEXT = '영어 + 일본어를 선택한 계정입니다. 문제는 혼합 출제되지 않으며, 영어 버튼과 일본어 버튼으로 언어를 전환해 각각 학습합니다.';

export function authMessage(error) {
  const map = {
    invalid_username: '아이디는 영문 소문자, 숫자, 마침표(.), 밑줄(_), 하이픈(-) 조합 3~24자로 입력해주세요.',
    invalid_password: '비밀번호는 8자 이상으로 입력해주세요.',
    invalid_display_name: '닉네임은 랭킹에 표시됩니다. 1~30자로 입력해주세요.',
    invalid_real_name: '실명은 관리자 확인용입니다. 2~30자로 입력해주세요.',
    invalid_birth_date: '생년월일을 올바르게 입력해주세요.',
    invalid_preferred_language: '학습 언어를 다시 선택해주세요.',
    username_taken: '이미 사용 중인 아이디입니다. 다른 아이디를 입력해주세요.',
    invalid_credentials: '아이디 또는 비밀번호가 맞지 않습니다. 다시 확인해주세요.',
    missing_token: '로그인이 필요합니다.',
    invalid_token: '로그인이 만료되었습니다. 다시 로그인해주세요.',
    admin_required: '관리자 권한이 필요합니다.',
    request_timeout: '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.',
    network_error: '서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해주세요.',
    api_error: '서버 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
    invalid_request_type: '요청 종류를 다시 선택해주세요.',
    invalid_request_message: '요청 내용은 1~1000자로 입력해주세요.',
    invalid_request_status: '요청 상태를 다시 선택해주세요.',
    invalid_question_count: '시험 문제 수를 다시 선택해주세요.',
    invalid_score: '선택한 문제 수를 모두 푼 뒤 저장해주세요.',
    invalid_level: '레벨 결과를 다시 확인해주세요.',
    invalid_current_password: '현재 비밀번호가 맞지 않습니다.',
    account_locked: '로그인 실패가 여러 번 발생해 계정이 잠시 잠겼습니다. 10분 후 다시 시도해주세요.',
    use_own_password_change: '본인 비밀번호는 내 정보에서 변경해주세요.',
  };
  return map[error?.message] || '처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
}
