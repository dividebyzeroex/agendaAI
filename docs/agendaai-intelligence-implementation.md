
# AgendaAI Intelligence — MVP implementado

**Escopo do código nesta branch:**
- Intelligence Hub em \`/admin/intelligence\`, exclusivo do dono do estabelecimento, com indicadores de agenda e recomendações baseadas em eventos reais (plano Agenda).
- Plano Gestão e planos legados: dados de pagamentos do caixa confirmados, cancelamentos e faltas; nenhum total é inferido por LLM.
- Growth IA: disponibilizado **somente** a estabelecimento em \`AI_GROWTH_PILOT_TENANTS\` ou plano explicitamente \`growth\`; nunca ativa assinatura automaticamente.
- Growth IA cria **rascunho**, validando autorização por dono, ID de serviço/profissional, disponibilidade real e quota; utiliza links atribuíveis por \`growth_social_campaigns\`. Nenhum disparo, publicação, cobrança, alteração de agenda ou assinatura.
- Texto generativo por Vercel AI Gateway, autenticado por OIDC (ou chave privada de Gateway em desenvolvimento), **desativado por padrão**. Sem habilitação explícita, retorna recomendações determinísticas sem custo de inferência.
- Quotas mensais no banco, por estabelecimento e tipo, reservadas com função atômica \`ai_reserve_usage\`: Agenda 3 leituras, Gestão 20, Growth 80 leituras + 8 rascunhos. São **limites iniciais de piloto**, não contrato comercial anunciado.
- O componente antigo que adicionava um evento sem validação foi desabilitado e agora direciona ao fluxo seguro de agenda. Insights falsos foram removidos.

## Configurar ambiente de prévia

1. Aplicar a migração \`agenda_ai_intelligence_usage_v1\` no projeto Supabase conectado e validar a tabela/RPC. A tabela só é acessível a \`service_role\` e tem RLS habilitada.
2. Confirmar \`SUPABASE_URL\` (ou \`NEXT_PUBLIC_SUPABASE_URL\`), \`SUPABASE_SERVICE_ROLE_KEY\`, \`SUPABASE_ANON_KEY\` (ou a chave publishable compatível) e \`PROJECT_URL\`, SEM compartilhar os valores em logs.
3. **Sem gastos:** manter `AI_GATEWAY_ENABLED` ausente ou `false`. O produto permanece em modo de regras, sem chamadas a modelos.
4. Depois de aprovação financeira, definir `AI_GATEWAY_MODEL` (ID `provider/model` do catálogo atual), `AI_GATEWAY_ENABLED=true` somente no Preview e orçamento de IA na Vercel. `VERCEL_OIDC_TOKEN` é gerado no deployment; fora dele, usar `AI_GATEWAY_API_KEY` privada.
5. Nunca colocar tokens, chaves ou conteúdo sensível no navegador ou no GitHub. Não habilitar cobrança/consumo por padrão.
6. Opcional: `AI_GROWTH_PILOT_TENANTS` com UUIDs de estabelecimentos consentidos somente no Preview; não altera assinatura.
7. Testar via navegador com estabelecimento proprietário autenticado; chamar \`/api/billing?action=ai-summary&tenantId=...\` sem token deve falhar com 401; outro tenant com token válido deve falhar com 403.
8. Testar quota, disponibilidades, estoque de slots, permissão de e-mail, cancelamento e comportamento sem modelo.

## Limites do MVP e próximos incrementos
- Não promete percentual de aumento de receita; cliques e agendamentos atribuídos não comprovam incremento.
- Não implementa IA de mensagens inbound por WhatsApp nem agente de cobrança.
- Não modifica os módulos de relatórios, caja/comanda, pagamentos ou campanhas existentes.
- Novos recursos premium dependem de testes de integração e validação econômica; Growth permanece em \`preview\` no catálogo Stripe.
- Ferramentas de leitura em linguagem natural, detecção de anomalias em comissões e atribuição financeira fina por campanha serão ondas posteriores.
- Usar controle de acesso no backend, não apenas no menu ou template Angular.

- Bloqueio preventivo: allowlist Growth IA ignorada em ambiente de produção. Endpoint experimental `ai-chat-test` retorna HTTP 410, evitando operações de agenda pelo protótipo legado.
- Intelligence Hub em Gerenciar; o menu principal mantém quatro entradas operacionais.
