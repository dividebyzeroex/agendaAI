import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface ProviderDetails { name: string; taxId: string; address: string; contact: string; }

@Component({
  selector: 'app-terms', standalone: true, imports: [RouterLink],
  template: `<main class="terms"><a routerLink="/">← AgendaAI</a><p class="eyebrow">CONDIÇÕES DE USO E PRIVACIDADE</p><h1>Uma contratação clara, desde o primeiro dia.</h1><p class="intro">Versão de 10 de outubro de 2026. Estas condições regem o teste e a contratação do AgendaAI Essencial.</p>
  <aside>Teste gratuito de 30 dias, sem cartão e sem conversão automática. Para pagar, você precisa escolher um ciclo, aceitar estas condições e confirmar a contratação no Stripe.</aside>
  <section aria-label="Identificação do fornecedor"><h2>Responsável pelo serviço</h2>
  @if (provider(); as business) {
    <p><strong>{{ business.name }}</strong><br>CPF/CNPJ: {{ business.taxId }}<br>{{ business.address }}<br>Atendimento, cancelamentos, reembolsos e privacidade: <a [href]="'mailto:' + business.contact">{{ business.contact }}</a></p>
  } @else { <p>{{ providerError() ? 'Identificação temporariamente indisponível. Não conclua uma contratação enquanto estes dados não estiverem disponíveis.' : 'Carregando identificação do fornecedor…' }}</p> }
  </section>
  <h2>1. O serviço contratado</h2><p>O AgendaAI Essencial organiza a agenda de um estabelecimento, seu catálogo de serviços, clientes, histórico de atendimentos e até cinco profissionais ativos. Inclui um link público para os clientes solicitarem agendamentos e ferramentas de registro de caixa. O estabelecimento configura e confere horários, serviços, preços e profissionais antes de divulgar o link.</p><p>Robôs de conversa no WhatsApp, campanhas automáticas, SMS, IA preditiva, integrações externas e suporte humano 24 horas não fazem parte da oferta de lançamento. Compartilhar seu link pelo WhatsApp não significa que o AgendaAI acessa ou responde suas conversas. Demonstrações visuais usam dados fictícios e não garantem aumento de receita ou redução de faltas.</p>
  <h2>2. Teste gratuito</h2><p>O teste começa na criação da conta do estabelecimento e termina após 30 dias. Não exige cartão e não autoriza débito. A mesma conta não recebe um novo período ao refazer o cadastro. Ao final, os recursos operacionais ficam indisponíveis até a contratação; o responsável pode acessar a área de assinatura e solicitar suporte e seus dados.</p>
  <h2>3. Preço e renovação</h2><p>O preço mensal do Essencial é R$ 97. Os ciclos opcionais, quando disponíveis no checkout, são trimestral por R$ 276,45, semestral por R$ 523,80 e anual por R$ 931,20. O valor total é cobrado no início de cada ciclo e a assinatura se renova na mesma periodicidade, até o cancelamento. Não são parcelas mensais de uma contratação anual. Você confere o total e o ciclo antes de confirmar no Stripe. Mudanças de preço serão comunicadas antes de uma renovação, permitindo cancelar.</p><p>Dados do cartão são processados pelo Stripe. O AgendaAI não recebe o número completo nem o código de segurança do cartão. Pagamentos de teste não são receita real nem contratam um serviço pago. Você não precisa contratar depois do período gratuito.</p>
  <h2>4. Cancelamento e reembolso</h2><p>O responsável pode cancelar a renovação na área de assinatura ou pelo e-mail comercial acima. O cancelamento mantém o acesso até o fim do ciclo já pago e interrompe cobranças futuras. Se houver falha no painel, envie a solicitação pelo e-mail comercial. O serviço não impõe multa de cancelamento.</p><p>Na primeira contratação, pedidos de desistência feitos em até sete dias dão direito à devolução integral do valor pago. Depois desse prazo, o cancelamento da renovação não implica devolução automática do período utilizado; cobranças duplicadas, indevidas, falhas de fornecimento e outros direitos legais serão analisados sem limitação dos direitos aplicáveis. O pedido deve identificar a conta e a cobrança, sem incluir senha ou dados completos do cartão. O prazo de crédito depende também do meio de pagamento após o processamento do reembolso.</p>
  <h2>5. Conta, equipe e uso responsável</h2><p>Use informações verdadeiras, uma senha individual e apenas dados que você tenha autorização para tratar. O dono do estabelecimento define as permissões da equipe e responde pela atualização dos serviços e horários. Não use o sistema para emergências, dados clínicos sensíveis, publicidade sem autorização, fraude ou atividades ilícitas. A conta pode ser suspensa por abuso comprovado, falha de pagamento ou risco à segurança, preservadas a possibilidade de suporte e as obrigações legais.</p>
  <h2 id="privacidade">6. Privacidade e tratamento de dados</h2><p>O fornecedor trata nome, e-mail, identificadores da conta e registros de contratação para disponibilizar o serviço, proteger o acesso, responder solicitações e cumprir obrigações legais. O estabelecimento decide quais dados de seus clientes e profissionais registrar e permanece responsável por informar essas pessoas e pela finalidade do uso; o AgendaAI processa esses registros para prestar o serviço ao estabelecimento.</p><p>Supabase fornece autenticação e banco de dados; Vercel fornece hospedagem; Stripe processa pagamentos quando contratados. Esses provedores podem operar infraestrutura fora do Brasil. O tratamento observa as regras aplicáveis e as condições de proteção dos provedores. A aplicação usa conexões HTTPS e controles de acesso por estabelecimento. Não oferece promessa de criptografia de ponta a ponta nem de risco zero.</p><p>Dados operacionais são mantidos enquanto a conta estiver em uso. O responsável pode solicitar uma cópia e a exclusão pelo e-mail comercial. Após verificar a identidade e a autorização, os dados serão excluídos ou anonimizados quando não houver obrigação legal, necessidade de segurança ou exercício regular de direitos que justifique sua retenção. Cópias técnicas de segurança seguem o ciclo de descarte do provedor. Dados de cobrança e provas de aceite podem precisar ser preservados por obrigações legais. A exclusão de uma conta não cancela automaticamente uma assinatura: solicite também o cancelamento.</p><p>Para acesso, correção, informações sobre compartilhamento, portabilidade quando aplicável, exclusão ou outras solicitações de privacidade, use o canal acima. Se você é cliente de um salão, procure também o estabelecimento que registrou seus dados. Não envie documentos sensíveis por um formulário público.</p>
  <h2>7. Comunicação e suporte</h2><p>O consentimento para ofertas é opcional e separado do aceite destas condições. Não autorizá-lo não impede o teste. Mensagens comerciais só são enviadas por canal habilitado, com autorização registrada e opção de descadastro. E-mails necessários à autenticação, segurança e contratação têm finalidade operacional. O suporte é prestado por e-mail comercial, sem promessa de atendimento humano ininterrupto.</p>
  <h2>8. Disponibilidade e condições gerais</h2><p>Interrupções, manutenção e falhas de terceiros podem ocorrer. Avise o suporte se uma falha impedir o uso contratado. Nenhuma disposição afasta direitos previstos na legislação ou transfere ao cliente responsabilidade por falhas atribuíveis ao fornecedor. Atualizações materiais destas condições serão informadas antes de exigirem novo aceite. O fornecedor e o estabelecimento devem manter seus dados e contatos atualizados.</p>
  <a class="back" routerLink="/login" [queryParams]="{trial:30}">Começar meus 30 dias grátis →</a></main>`,

  styles: [`.terms{max-width:820px;margin:auto;padding:48px 24px 90px;color:#263442;font:16px/1.8 system-ui}.terms a{color:#146650}.eyebrow{font-size:11px;letter-spacing:2px;margin-top:56px;color:#547463}h1{font-size:clamp(32px,5vw,48px);line-height:1.15;letter-spacing:-1.5px}h2{font-size:22px;margin-top:40px}.intro{color:#65717d}aside{border-left:3px solid #18705c;background:#edf6f1;padding:22px;margin:32px 0}.back{display:inline-block;margin-top:32px}`]
})
export class Terms implements OnInit {
  readonly provider = signal<ProviderDetails | null>(null);
  readonly providerError = signal(false);

  async ngOnInit() {
    try {
      const response = await fetch('/api/commercial?action=terms', { cache: 'no-store' });
      if (!response.ok) throw new Error('Provider unavailable');
      const business: unknown = await response.json();
      if (!business || typeof business !== 'object' ||
          !['name', 'taxId', 'address', 'contact'].every(key => {
            const value = (business as Record<string, unknown>)[key];
            return typeof value === 'string' && value.trim().length > 0;
          })) throw new Error('Provider incomplete');
      this.provider.set(business as ProviderDetails);
    } catch {
      this.providerError.set(true);
    }
  }
}
