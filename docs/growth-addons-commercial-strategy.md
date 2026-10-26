# AgendaAI — estratégia de módulos e adicionais (proposta comercial)

> Documento estratégico. **Não altera preços, assinaturas Stripe, direitos adquiridos nem cobrança sem aprovação.**
> Pesquisa do mercado realizada em 18/10/2026. Comunicação pública: utilizar apenas o termo **concorrente**, sem marcas ou links de concorrentes.

## Posição competitiva

- Concorrente com cobrança por profissional: mensalidade de referência de R$ 99,99 + impostos e R$ 20 por adicional; inclui funcionalidades essenciais e de marketing. Não bloquear o marketing básico.
- Concorrente com plano por faixa: referência anual a partir de R$ 76/mês para 1–2 profissionais, com onboarding disponível.
- Concorrente com plano por faixa: referência anual a partir de R$ 88,90/mês para até dois profissionais, com módulos operacionais e adicionais.
- Nosso preço comercial anterior foi ofertado a R$ 97/mês; antes de mudar preço, medir margens, CAC, ativação e retenção. Não chamar valor promocional de preço corrente.

## O que DEVE fazer parte do AgendaAI Core (sem paywall adicional)

1. Agendamento online e página pública, disponibilidade real, múltiplos profissionais/serviços, reagendamento e bloqueios.
2. Cadastro de clientes, histórico, perfis e autorizações de contato, cadastro/importação básica CSV.
3. Caixa, comandas, comissões, relatórios básicos, controle operacional e gestão do salão.
4. Link de reservas, indicadores de fontes e campanhas básicas (Growth Studio v1) e modelo de mensagem para resposta manual.
5. Segurança, permissões, LGPD, lembretes essenciais onde economicamente viáveis — franquia transparente para mensagens pagas de terceiros.
6. Suporte básico e primeira configuração autoassistida; implantação Concierge gratuita para salões fundadores selecionados.

## Módulos adicionais previstos (preços preliminares, sem checkout)

| Módulo | Conteúdo adicional real | Preço de hipótese | Critério de lançamento |
|---|---|---:|---|
| **Social Studio Pro** | Calendário, fila e relatórios multicanal do Zernio | **R$ 79/mês previsto** | Franquia e custos de contas conectadas a validar |
| **Growth Automations** | Ociosidade detectada por regras, propostas de campanhas, aprovação em lote e testes | **R$ 49/mês previsto** | Exigir confirmação humana para publicação |
| **Retenção Premium** | Segmentação avançada e jornadas de retorno com consentimento | **R$ 49/mês previsto + consumo** | Mensagens e permissões transparentes |
| **Inteligência Financeira** | Projeção de caixa, margem e metas avançadas | **R$ 39/mês previsto** | Relatórios e caixa básicos inclusos no Core |
| **Multiunidades / Franquias** | Consolidação por rede, benchmarking e permissões | **Sob orçamento** | Custo por unidade; calendários extras no mesmo salão gratuitos |
| **Concierge Plus** | Migração complexa e treinamento dedicado | **Orçamento único** | Onboarding e suporte básicos inclusos no Core |

**Composição comercial:** preço mensal total = **R$ 97 Essencial + soma dos módulos mensais escolhidos**. Exemplos previstos: Social Studio Pro R$ 176/mês; Growth Automations R$ 146/mês; Retenção Premium R$ 146/mês (mais consumo externo); Inteligência Financeira R$ 136/mês. Multiunidades é adicional sob proposta e Concierge Plus prevê taxa única, não mensalidade extra.

**Estes preços são hipóteses exibidas como prévia na landing, não módulos ativos nem disponíveis para compra.** Não criar SKUs, assinaturas ou CTAs de compra antes de entrega funcional e autorização comercial.

**Nunca cobrar extra** para habilitar funções centrais já comparáveis a concorrentes de gestão de salões: agenda, profissionais essenciais, cadastro de clientes, comissões, checkout/caixa, relatórios base, link público ou segurança.

## Matriz de custos / unit economics

Zernio cobra (bandas progressivas globais): primeiras 2 contas conectadas grátis; contas 3–10 US$ 6 por conta/mês; 11–100 US$ 3; 101–2.000 US$ 1. O custo tem variação de câmbio, tributos, tarifas de mensagem/ads/WhatsApp e não equivale a uma franquia grátis por cada salão.

Para cada módulo:
**margem de contribuição = mensalidade líquida – (custo de contas e tráfego + IA + mensagens + taxas + suporte incremental).**
Meta inicial de margem >= 65% após custos variáveis; revisar se CAC e cancelamentos tornarem unidade deficitária.
Nenhum recurso externo sem teto de consumo por plano, alertas e política clara de excedente.

## Sequência de monetização

1. **Agora:** lançar Growth Studio v1 no Core, sem cobrança nova; medir quantos salões criam campanha, cliques, agendamentos atribuídos, pagamento real e retenção de 30 dias.
2. **Após pilotos:** validar demanda para Social Studio Pro com 5 clientes usando redes sociais semanalmente. Criar franquia por conta social, com cancelamento simples.
3. **Depois:** vender Growth Automations somente após os pilotos mostrarem ganho mensurável de ocupação e nenhum abuso de comunicação.
4. **Em seguida:** lançar inteligência financeira e gestão multiunidades por demanda real. Não construir extras sem usuários.

## Segurança e transparência

- Campanhas de preenchimento de horários exigem ação humana para publicar. Não disparar mensagens em massa sem consentimento.
- Cliques são contagem aproximada por dia; **agendamentos atribuídos não são vendas faturadas** e não provam causalidade.
- Atribuição vincula campanha ao estabelecimento e ao evento real registrado no servidor.
- Prazo fundador de 365 dias e comissões Indica+ permanecem independentes de qualquer upgrade.
- Mudanças comerciais exigem aprovação explícita e testes de faturamento Stripe.

## Checklist de MVP Growth

- [x] Consulta autenticada de horários vagos em janela limitada
- [x] Campanha com legenda modelo e URL rastreável
- [x] Editor social pré-preenchido; seleção manual de mídia/rede/horário
- [x] Visitas agregadas sem dados pessoais do visitante
- [x] Agendamentos atribuídos apenas no servidor e no tenant
- [x] Contagem de clientes inativos com permissão de contato
- [ ] Teste ponta a ponta com redes sociais reais e reservas reais
- [ ] Enriquecimento por IA generativa, respostas automáticas e envio proativo (não implementados)
- [ ] Rastreamento de receita após pagamento com conciliação (não implementado)
