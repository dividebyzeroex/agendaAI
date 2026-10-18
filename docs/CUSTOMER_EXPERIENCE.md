# Experiência do cliente: rotina antes de configuração

## Problema e decisão

O aplicativo exigia que o cliente compreendesse muitos módulos antes de atender: tutorial automático sobre a tela, configuração repetida na página inicial, formulários em janelas e impressão aberta automaticamente no recebimento. A nova estrutura prioriza o trabalho do dia e apresenta opções adicionais quando solicitadas.

## Referências oficiais consultadas em 14/10/2026

- [Trinks: página de agenda](https://ajuda.trinks.com/menu-agenda): a agenda concentra a rotina; criação com cliente, profissional, serviço e horário; recebimento acessível pelo atendimento.
- [Fresha: criar atendimento individual](https://www.fresha.com/help-center/knowledge-base/calendar/260-create-appointments-1): criação e gestão pelo calendário, com dados do atendimento juntos.
- [Booksy: agendamento online](https://biz.booksy.com/pt-br/recursos/agendamento-online): disponibilidade, serviços e preços acessíveis ao cliente para reserva autônoma.

Essas fontes orientam a hierarquia e a sequência de trabalho. As telas são próprias do AgendaAI; nenhuma redução de tempo ou aumento de conversão é apresentado como resultado medido.

## Mudanças implementadas

| Jornada | Antes | Agora |
| --- | --- | --- |
| Navegação | Muitos módulos de mesmo peso | Hoje, Agenda, Clientes e Caixa; gestão reunida em Gerenciar |
| Primeiro contato | Tutorial automático em janela | Próximo passo discreto e página explícita para preparar a agenda |
| Página inicial | Cinco cartões, checklist completo, insights e atalhos competindo | Agenda de hoje, três números operacionais e uma ação principal |
| Cadastro do negócio | Quatro telas; CNPJ, endereço e volume exigidos | Um formulário; nome, segmento, telefone, link e aceite; dados complementares opcionais |
| Primeiro profissional | Configuração distribuída por módulos | Serviço inicial, profissional e dias/horários na mesma configuração |
| Agendamento pelo balcão | Janela com cartões horizontais; data/hora não editáveis | Página contínua com busca de cliente, criação no mesmo fluxo, serviço, profissional, dia e hora |
| Reserva pública | Perfil, serviço, profissional, horário, confirmação | Serviço e preferência opcional; horário; dados e confirmação |
| Atendimento | Janela com ações de peso semelhante | Página com próxima ação, recebimento contextual, remarcação e outras ações recolhidas |
| Cadastro de cliente | Janela com todos os campos | Página com nome e telefone; detalhes de contato, pet e atendimento sob demanda |
| Base de clientes | Importação em destaque permanente e botões de envio direto | Lista, busca e agendamento; importação e composição de SMS por escolha explícita |
| Equipe | Cartões densos e editor flutuante no celular | Lista compacta; edição em área normal; aparência e redes recolhidas |
| Caixa | Abrir janela para turno; procurar novamente cliente; impressão automática | Abertura na própria página; link do atendimento preenche o contexto; impressão por ação explícita |
| Configurações | Três cartões de links antes dos dados do negócio | Dados e abas de configuração primeiro; links e assinatura em uma seção opcional |

## Regras de comportamento

- Um serviço ou profissional único é selecionado automaticamente. Valores financeiros são exibidos para revisão; nenhum pagamento real é disparado por navegação.
- Na reserva pública, o calendário começa no próximo dia com expediente quando não há mais tempo no dia atual; somente horários disponíveis são exibidos. Valores e datas da interface usam português do Brasil.
- O fim do agendamento acompanha a duração do serviço. Horários usam America/Sao_Paulo, com instantes enviados em UTC.
- Preferência por qualquer profissional resolve um profissional elegível livre no horário, respeitando vínculo, expediente e intervalo; o servidor continua validando a reserva.
- Falha ao salvar preserva os dados. Se um novo cliente já foi salvo antes de uma falha no agendamento, a tentativa seguinte reutiliza seu ID.
- Conflito detectado antes do envio orienta outro horário; falha ao arrastar devolve o evento à posição anterior. A checagem local não substitui validação concorrente do servidor.
- Busca sem resultados não informa que a carteira está vazia. Pessoas com telefone compartilhado permanecem visíveis como cadastros separados.
- Confirmação de exclusão é contextual, na própria página. Ações de cobrança e envio continuam explícitas.
- Não há disparo comercial, alteração de assinatura ou movimentação de dados reais durante as verificações automatizadas.
- Nenhuma função serverless adicional: o orçamento continua em 12.

## Verificação e próximos indicadores

Testes de componentes Angular exercitam formulários reais, datas, falha e repetição, conflitos, preferência por profissional, importação disponível sob demanda e passagem do atendimento ao recebimento. A compilação de produção valida todos os templates e rotas. Uma navegação automatizada em Chromium com dados e APIs simulados verifica desktop e celular: início, criação de agendamento, início/conclusão de atendimento, navegação móvel, cadastro de cliente e calendário público, sem erros de JavaScript ou rolagem horizontal a 390 px. Nenhum desses passos usa a base real. A validação automatizada de componentes não substitui uma sessão de teste com usuários em aparelhos reais.

Acompanhar com os indicadores já existentes: estabelecimentos com agenda pronta, primeiro agendamento, reservas pelo link e retorno ao uso. Comparar antes/depois apenas após observar uma coorte que recebeu esta versão; ausência de telemetria anterior não indica ausência de uso. Para medir abandono por etapa da reserva pública, será necessária instrumentação específica, ainda não implementada.
