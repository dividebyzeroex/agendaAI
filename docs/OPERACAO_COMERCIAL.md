# AgendaAI — operação comercial e implantação

Situação: implementação preparada em branch de revisão. Produção ainda não alterada. Nenhum prospect foi contatado nesta execução.

## Proposta comercial

Piloto inicial: salões e barbearias de pequeno porte, começando em São Paulo. Dor central: conciliar horários, equipe e cadastro de clientes em ferramentas separadas. A oferta é um teste de **30 dias**, sem cartão, sem renovação automática do teste e com contratação explícita no checkout. O período começa na criação do primeiro estabelecimento do usuário; criar outro não reinicia o benefício.

Planos mensais: Starter R$97; Business Pro R$197; Premium R$349. Ciclos trimestral/semestral/anual têm descontos de 5%/10%/20%, calculados no servidor em centavos. Anual: R$931,20 / R$1.891,20 / R$3.350,40, cobrados por ciclo, com recorrência claramente apresentada no checkout.

Benefícios demonstráveis: agenda pública, organização de clientes e equipe, gestão de atendimento e caixa, visão gerencial. Mensageria exige canais configurados. Foram retiradas estatísticas comerciais inventadas e promessas de redução de faltas, faturamento ou disponibilidade garantida.

## Painel do proprietário

`/platform-admin/dashboard`: clientes totais, acesso ativo, testes, pagantes, MRR e atividade.
`/platform-admin/growth`: prospects, origem, consentimento, etapas, execuções e falhas.
`/platform-admin/tenants`: pesquisa, situação, vencimento do teste e bloqueio de acesso.
`/platform-admin/billing`: receitas brutas confirmadas e MRR mensalizado; taxas, impostos e estornos posteriores não são lucro calculado.
`/platform-admin/settings`: configuração real, sem chaves fictícias ou botões de configuração sem efeito.

A autorização é conferida no banco por uma lista privada de proprietários vinculada à identidade autenticada. O primeiro proprietário é provisionado a partir da conta de e-mail confirmado que já estava identificada no projeto. Confirme a existência dessa conta antes da publicação.

## Agentes implementados

- Descoberta: uma consulta Google Places por dia, no máximo dez empresas, com deduplicação pelo identificador público. O escopo é configurável em `COMMERCIAL_SEARCH_QUERY`.
- Convite: apresentação transparente do assistente automatizado e oferta de teste.
- Ativação: boas-vindas e acompanhamento do uso na primeira semana.
- Conversão: aviso próximo ao vencimento e após o fim do teste, sem cobrança automática.
- Retenção: boas-vindas ao plano pago e pedido de feedback após trinta dias.
- Controle: fila persistente, reserva de execução, limite diário, intervalo mínimo de três dias entre contatos, registro do aceite, assinatura de descadastro e interrupção após resposta/reclamação/bounce.

Os agentes são rotinas de aquisição e relacionamento com textos aprovados e regras determinísticas. Não representam uma equipe humana nem um vendedor autônomo capaz de resolver qualquer objeção. Respostas recebidas interrompem a cadência e são encaminhadas à caixa de resposta configurada; o CRM registra a etapa. Não há negociação automática de contratos ou descontos.

Descoberta pública não equivale a autorização de envio. Os contatos descobertos entram em `new`, sem e-mail inferido nem consentimento. O envio usa contatos com autorização registrada, incluindo novos clientes que optem pelo acompanhamento. Portanto, configurar apenas Google Places não produz uma campanha fria automaticamente.

Cron Vercel preparado para execução horária. É necessário confirmar que o plano Vercel suporta essa frequência; não foi contratado upgrade. `COMMERCIAL_ENABLED` inicia em `false`.

## Migrações que requerem aprovação

A revisão automática rejeitou a aplicação no banco de produção por envolver alteração ampla de autorização, cobrança e estruturas. Não foi tentado contornar a rejeição.

1. `20261004141727_commercial_operations.sql`: tabelas CRM, mensagens, histórico, receitas, aceites; proprietário privado; período padrão de 30 dias; proteção de campos de assinatura; indicadores reais; bloqueio de atualizações de faturamento pelo navegador.
2. `20261004141855_agenda_security_tenant_isolation.sql`: identidade verificada, isolamento de funções e políticas, retirada de acesso público a OTPs e projeção mínima dos dados públicos; novas colunas de proprietário/empresa nos workflows.
3. `20261004201239_booking_entitlements.sql`: acesso por prazo no banco, manutenção de leitura da própria conta vencida para cobrança, bloqueio atômico de sobreposição de horários e limite de tentativas de reserva pública.

Nenhuma dessas migrações apaga clientes ou agendamentos. Permissões são restringidas. Workflows antigos sem atribuição confiável ficam sem acesso pelo navegador e precisam ser revisados, sem inferir a quem pertencem. Testes antigos não são reativados em massa. A migração de sobreposição deve falhar se houver conflitos históricos; a consulta de preflight encontrou zero pares sobrepostos na auditoria, mas precisa ser repetida antes da aplicação.

Antes de aprovar: snapshot/backup recuperável do banco, conferir a identidade do proprietário, revisar workflows antigos e autorizar as três migrações sobre `supabase-agendai` (`vvanjarfwdxtzklogysy`). Após aprovação, aplicar em ordem e verificar isolamento com contas de teste. Não fazer merge em `develop` antes de preparar as dependências: essa é a branch usada em produção.

## Configuração necessária

A auditoria da Vercel encontrou apenas as três variáveis Supabase. As demais não foram configuradas neste trabalho.

- `PROJECT_URL`: URL HTTPS canônica.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: configurar inicialmente em modo de teste e validar cobrança, renovação, cancelamento e reembolso.
- `RESEND_API_KEY`, remetente validado em `COMMERCIAL_FROM`, caixa real em `COMMERCIAL_REPLY_TO`, `RESEND_WEBHOOK_SECRET`. Endpoint `/api/commercial-webhook` para `email.received`, `email.bounced`, `email.complained`, `email.suppressed`.
- `COMMERCIAL_UNSUBSCRIBE_SECRET`, `CRON_SECRET`, `PUBLIC_BOOKING_RATE_SECRET`: segredos aleatórios distintos.
- `BUSINESS_LEGAL_NAME`, `BUSINESS_TAX_ID`, `BUSINESS_ADDRESS`, `BUSINESS_CONTACT_EMAIL`: dados reais do fornecedor.
- `CONTRACT_READY=false` até finalizar e publicar o contrato. A versão atual em `/termos` é uma minuta; não é contrato jurídico final. O checkout fica bloqueado enquanto esses dados e o sinalizador não estiverem configurados.
- `GOOGLE_PLACES_API_KEY`: opcional, descoberta de oportunidades. Impor orçamento no provedor. Não foi autorizado nem realizado upgrade ou gasto.
- `COMMERCIAL_DAILY_LIMIT=10`, teto técnico de 50; habilitar `COMMERCIAL_ENABLED=true` apenas depois dos testes e da reputação do remetente validada.
- SMS e comunicação operacional: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_FROM`, `RESEND_FROM_EMAIL`.

O `.env` e o arquivo de contas temporárias estavam versionados. Foram removidos da nova árvore Git e ignorados. Isso não remove o histórico: quaisquer credenciais válidas ali contidas precisam ser revogadas/rotacionadas. Não foram reutilizadas para configurar provedores.

## Validação e limites

- `npm run build`: compilação de produção; rotas administrativas carregadas sob demanda.
- `npm run typecheck:api`: verificação TypeScript do backend.
- `npm run test:api`: 20 testes de autorização, preço, reconciliação, cron e contatos.
- `npm run test:db`: executa as três migrações em PostgreSQL embarcado PGlite com esquema observado, funções e políticas reproduzidas; valida propriedade, RLS, campo protegido, trial, fila exclusiva, limite e conflito de reserva. O fixture contém somente definições de esquema, sem linhas reais de clientes. Não reproduz integralmente Auth/Vault, infraestrutura e todas as constraints existentes, portanto não substitui teste em staging Supabase.

Pendências de homologação: navegação real desktop/mobile, signup e confirmação de e-mail, profissional convidado, reserva pública e privada, acesso após vencimento, Stripe sandbox e webhooks, domínio de remetente, descadastro e respostas. A instalação do navegador local falhou por problemas no download/certificado; não declarar E2E completo com base só no build.

Riscos legados a continuar auditando: criptografia no cliente e leitura por equipe, funções ainda `SECURITY DEFINER`, idempotência das automações operacionais de SMS, políticas de retenção e exercício de direitos, custos reais de mensageria/IA. Os testes realizados não justificam afirmar ausência total de falhas ou prontidão irrestrita para vender.

## Retorno em caso de falha

Manter o deploy anterior disponível. Pausar `COMMERCIAL_ENABLED` e o cron comercial para interromper novos envios. Não reverter políticas de segurança automaticamente nem excluir tabelas com dados novos. Compatibilizar o aplicativo anterior com as políticas corrigidas ou restaurar o snapshot por procedimento aprovado. Conferir fila e estado dos provedores antes de reprocessar mensagens ou eventos de cobrança.

## Referências consultadas

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Google Places Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
- LGPD: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- Comércio eletrônico: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm
