# Página de vendas conversacional — Fase 1

## Escopo implementado

- Primeiro contato em uma conversa pública, acessível sem cadastro e com atalhos para os problemas mais comuns.
- Diagnóstico incremental local no navegador, com quatro áreas: agenda, equipe, recebimentos e crescimento.
- Recomendação somente dos planos comercializáveis `agenda` e `gestao`; Growth IA permanece prévia.
- Cotação pública somente-leitura em `GET /api/billing?action=public-quote&planId=...&months=...`, validada e calculada pelo catálogo compartilhado do checkout Stripe, sem autenticação nem criação de cobranças.
- Ciclos de 1, 3, 6 e 12 meses, sem preços ou descontos gerados livremente.
- Demonstração fictícia existente e CTA para teste de 30 dias.
- Fallback explícito quando cotação não responde, sem publicar um preço possivelmente desatualizado.

## Limites conscientes

A análise de linguagem desta primeira fase é **determinística** e executada no próprio navegador: não depende de geração LLM, não extrai dados de calendários e não persiste respostas de visitantes. Portanto a experiência não deve ser anunciada como um agente generativo já integrado. Isso evita consumo público irrestrito da chave AI Gateway e preserva o limite financeiro do piloto. O recurso pode ser evoluído para IA generativa com proteção de quota global, antiabuso, auditoria no AI Owner e fallback local.

A recomendação é exploratória. Não assegura migração nem acesso automático às funcionalidades opcionais. Os atuais planos de cobrança e benefícios legados permanecem intactos. Diferenciação técnica de acesso por plano ainda requer validação das APIs e RLS.

## Próximas etapas

1. Simulação personalizada da agenda com dados fictícios conforme segmentos e necessidade.
2. Importação CSV e Google Agenda em modo somente leitura, com consentimento, retenção curta, exclusão e proteção de tokens; Outlook depois de validação.
3. Instrumentação de conversão e custo no AI Owner; integração com pipeline comercial e cotação persistente.
4. Liberação controlada de narrativa generativa baseada em fatos, com quota atômica e opção de desativar pelo Owner.

## Segurança comercial

Não há alteração em pagamento, webhook, dados de clientes ou produção. O endpoint público valida uma lista estrita de planos e ciclos; a autoridade para contratação continua no checkout autenticado no servidor.
