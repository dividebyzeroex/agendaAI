# AgendaAI — lançamento em 10/10/2026

A oferta atual é AgendaAI Essencial, R$97 por mês, até cinco profissionais ativos. O teste dura 30 dias desde a criação do primeiro estabelecimento, sem cartão e sem cobrança automática. Ciclos opcionais: três meses R$276,45; seis R$523,80; doze R$931,20, pagos por ciclo com renovação periódica até cancelamento. Os planos antigos não são oferecidos no checkout de lançamento.

A página de interesse registra novos prospects sem consentimento de marketing e sem criar uma conta. A confirmação do e-mail e a configuração inicial permanecem necessárias para utilizar o aplicativo.

Foram retirados os painéis sociais e de observabilidade simulados, a inicialização de agentes fictícios no navegador, ofertas de chatbot e SMS, demonstrações que sugeriam WhatsApp automatizado e o cron de SMS não homologado. A rotina comercial permanece desativada até validar o remetente e os destinatários autorizados.

## Validação concluída

- Compilação Angular de produção e verificação TypeScript do backend.
- 26 testes de preço, reconciliação, segurança, datas de São Paulo, intervalos ocupados e configuração de cobrança.
- Seis migrações executadas em banco local; testes de isolamento, proteção de cobrança, limite de equipe, sobreposição, janela gratuita, limitação de tentativas e autorização do proprietário somente após confirmação do e-mail.
- Migrações launch_readiness, restrict_internal_rpc e distinguish_test_contracts aplicadas ao Supabase de produção e colunas verificadas.
- Campos de faturamento protegidos contra alterações pelo navegador. Pagamentos Stripe de teste excluídos dos indicadores e da lista financeira real.
- Checkout exige aceite explícito e verifica conexão Stripe, situação da conta e endpoint de webhook habilitado na modalidade correta. A existência da secret não prova que corresponde ao endpoint: a entrega assinada precisa ser homologada.

## Acesso do proprietário

A conta designada é joao.almeida.msbrasil@gmail.com. O banco ainda mostra e-mail sem confirmação. Ao confirmar, a função de provisionamento concede acesso ao painel privado. Não se deve confirmar essa identidade artificialmente nem usar dados de user_metadata para conceder privilégios.

Painel: /platform-admin/dashboard. Carteira: /platform-admin/tenants. Prospecção: /platform-admin/growth. Financeiro: /platform-admin/billing. Os valores financeiros representam receita bruta, não lucro líquido.

## Pendências reais para operar

1. Publicar o último commit de develop em produção. O conector Vercel e o CLI recusam acesso à equipe. A integração Git gera preview; isso não promove produção.
2. Confirmar a conta do proprietário e homologar cadastro externo, recebimento do e-mail, configuração do estabelecimento e uma reserva real. Não foi possível provar a entrega SMTP com os acessos disponíveis.
3. Homologar checkout, entrega do webhook, renovação, cancelamento e reembolso no Stripe. Credenciais existem em produção, mas não estão disponíveis em preview; não expor nem copiar secrets para o navegador.
4. Validar Resend, remetente comercial e registro de opt-in antes de ativar COMMERCIAL_ENABLED. Os prospects pesquisados não têm autorização de envio. O Gmail pessoal não é remetente alternativo.
5. Ativar proteção contra senhas vazadas no Supabase Auth quando suportada pelo plano. As funções públicas de agenda usam projeções mínimas intencionais; tabelas internas sem políticas são bloqueadas ao navegador.

Os dados reais do fornecedor estão publicados com autorização explícita. O contrato usa versão 2026-10-10. CONTRACT_READY=true foi configurado para novos deployments e sinaliza a publicação das condições; não substitui homologação de cobrança, de e-mail ou da operação. Não há promessa de clientes, aumento de receita ou agentes continuamente ativos 24 horas.
