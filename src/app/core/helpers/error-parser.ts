export function parseSupabaseError(error: any): string {
  if (!error) return 'Ocorreu um erro desconhecido.';

  const code = error.code || (error.error && error.error.code);
  const message = error.message || (error.error && error.error.message) || String(error);

  // Mapeamento de códigos padrão do PostgreSQL/Supabase
  switch (code) {
    case '42501': // insufficient_privilege (RLS)
      return 'Permissão negada: você não tem privilégio para realizar esta operação.';
    case '23505': // unique_violation
      return 'Este registro já existe e não pode ser duplicado (conflito de dados).';
    case '23503': // foreign_key_violation
      return 'Não é possível excluir este registro, pois ele está vinculado a outros itens no sistema.';
    case '22P02': // invalid_text_representation (geralmente problema de Enum ou UUID inválido)
      return 'Valor fornecido é inválido para este tipo de dado. Verifique suas seleções.';
    case '23502': // not_null_violation
      return 'Um campo obrigatório não foi preenchido corretamente.';
    case 'PGRST116': // json object requested, multiple/no rows returned
      return 'Registro não encontrado ou você não tem permissão para acessá-lo.';
  }

  // Traduções de mensagens comuns em texto (fallback)
  if (message.includes('JWT expired')) {
    return 'Sua sessão expirou. Por favor, faça login novamente.';
  }
  if (message.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (message.includes('User already registered')) {
    return 'Este e-mail já está registrado no sistema.';
  }
  if (message.includes('Failed to fetch')) {
    return 'Erro de conexão. Verifique sua internet e tente novamente.';
  }

  // Se for um erro customizado que nós mesmos lançamos, repassa a mensagem.
  // Caso contrário, mostra o erro traduzido.
  return message;
}
