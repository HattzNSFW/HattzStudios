import type { ReactNode } from 'react';
import type { ControlBenefitRef, ControlRoleRef, ControlSnapshot } from './controlModel';

type PillTone = 'neutral' | 'purple' | 'soft' | 'demo';

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: PillTone }) {
  return <span className={`control-pill control-pill--${tone}`}>{children}</span>;
}

function Section({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <section className="control-section hattz-liquid-glass" aria-labelledby={`${id}-title`}>
      <header className="control-section__header">
        <span className={`hattz-icon hattz-icon--${icon}`} aria-hidden="true" />
        <div className="control-section__heading">
          <h2 id={`${id}-title`}>{title}</h2>
          {description ? <p className="control-section__description">{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="control-empty" role="note">
      <p className="control-empty__title">{title}</p>
      <p className="control-empty__text">{text}</p>
    </div>
  );
}

function BenefitList({ items }: { items: readonly ControlBenefitRef[] }) {
  return (
    <ul className="control-inline-list">
      {items.map((benefit) => (
        <li key={benefit.key}>
          {benefit.name} <code>{benefit.key}</code>
        </li>
      ))}
    </ul>
  );
}

function RoleList({ items }: { items: readonly ControlRoleRef[] }) {
  if (items.length === 0) return <p className="control-muted">Nenhum cargo associado.</p>;
  return (
    <ul className="control-inline-list">
      {items.map((role) => (
        <li key={role.key}>
          {role.name} <code>{role.key}</code>
        </li>
      ))}
    </ul>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="control-meta-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ControlContent({ snapshot }: { snapshot: ControlSnapshot }) {
  const overview = [
    { label: 'Badges cadastrados', value: snapshot.overview.badges },
    { label: 'Molduras cadastradas', value: snapshot.overview.frames },
    { label: 'Categorias', value: snapshot.overview.categories },
    { label: 'Raridades', value: snapshot.overview.rarities },
    { label: 'Cargos definidos', value: snapshot.overview.roles },
    { label: 'Benefícios definidos', value: snapshot.overview.benefits },
    { label: 'Coleções cadastradas', value: snapshot.overview.collections },
  ];
  const hasCatalogData = overview.some((item) => item.value > 0);

  return (
    <div className="control-content">
      <aside
        className="control-notice hattz-liquid-glass"
        role="note"
        aria-label="Limitações do Control"
      >
        <span className="hattz-icon hattz-icon--shield" aria-hidden="true" />
        <p className="control-notice__title">Consulta somente leitura</p>
        <ul>
          <li>
            Este Control não concede nem revoga cargos, benefícios, badges, molduras ou posse, e não
            altera catálogos.
          </li>
          <li>
            Não existe sessão administrativa local: autoridade administrativa real depende de
            backend e RLS futuros.
          </li>
          <li>Dados de demonstração são fictícios e nunca representam concessões reais.</li>
          <li>O cargo público Owner não concede acesso administrativo ao Control.</li>
        </ul>
      </aside>

      <Section
        id="visao-geral"
        title="Visão geral"
        icon="overview"
        description="Contagens derivadas dos catálogos e contratos carregados — nenhum número é fixo na interface."
      >
        <dl className="control-stats">
          {overview.map((item) => (
            <div className="control-stat" key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        {hasCatalogData ? null : (
          <EmptyState
            title="Nenhum dado cadastrado"
            text="Os catálogos e contratos disponíveis não contêm itens nesta etapa."
          />
        )}
      </Section>

      <Section
        id="badges"
        title="Catálogo de badges"
        icon="badge"
        description="Definições de catálogo: cadastrar um badge não significa que alguém o possua."
      >
        {snapshot.badges.length === 0 ? (
          <EmptyState
            title="Nenhum badge cadastrado"
            text="Não há definições de badge disponíveis nos catálogos carregados."
          />
        ) : (
          <ul className="control-card-grid">
            {snapshot.badges.map((badge) => (
              <li className="control-card" key={badge.key}>
                <div className="control-card__top">
                  <h3>{badge.name}</h3>
                  <Pill tone="purple">{badge.availability}</Pill>
                </div>
                <p className="control-card__key">
                  <code>{badge.key}</code>
                </p>
                <p className="control-card__text">{badge.description}</p>
                <dl className="control-card__meta">
                  <Meta label="Categoria" value={badge.category} />
                  <Meta label="Raridade" value={badge.rarity} />
                  <Meta label="Item especial" value={badge.isSpecial ? 'Sim' : 'Não'} />
                </dl>
                <div className="control-card__flags">
                  {badge.isDemo ? <Pill tone="demo">Demonstração</Pill> : <Pill>Produção</Pill>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="molduras"
        title="Catálogo de molduras"
        icon="frame"
        description="Somente molduras efetivamente cadastradas no catálogo são exibidas."
      >
        {snapshot.frames.length === 0 ? (
          <EmptyState
            title="Nenhuma moldura cadastrada"
            text="Não há definições de moldura disponíveis nos catálogos carregados."
          />
        ) : (
          <ul className="control-card-grid">
            {snapshot.frames.map((frame) => (
              <li className="control-card" key={frame.key}>
                <div className="control-card__top">
                  <h3>{frame.name}</h3>
                  <Pill tone="purple">{frame.availability}</Pill>
                </div>
                <p className="control-card__key">
                  <code>{frame.key}</code>
                </p>
                <p className="control-card__text">{frame.description}</p>
                <dl className="control-card__meta">
                  <Meta label="Categoria" value={frame.category} />
                  <Meta label="Raridade" value={frame.rarity} />
                  <Meta label="Permanência" value={frame.permanence} />
                  <Meta label="Aparência" value={frame.animation} />
                </dl>
                <p className="control-card__hint">Sem arte associada no catálogo nesta etapa.</p>
                <div className="control-card__flags">
                  {frame.isDemo ? <Pill tone="demo">Demonstração</Pill> : <Pill>Produção</Pill>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="cargos"
        title="Cargos"
        icon="role"
        description="Hierarquia e regras de herança conforme os contratos de permissões."
      >
        <div className="control-callout" role="note">
          <p>
            Hierarquia: quanto maior o número, mais alto o cargo. Benefícios próprios e herdados
            aparecem separadamente.
          </p>
          <p>
            Owner e Creator são cargos privados. O cargo público Owner <strong>não</strong> equivale
            à autoridade administrativa do Control.
          </p>
        </div>
        {snapshot.roles.length === 0 ? (
          <EmptyState
            title="Nenhum cargo definido"
            text="Não há definições de cargo disponíveis nos contratos carregados."
          />
        ) : (
          <ul className="control-card-grid">
            {snapshot.roles.map((role) => (
              <li className="control-card" key={role.key}>
                <div className="control-card__top">
                  <h3>{role.name}</h3>
                  <span className="control-card__number">hierarquia {role.hierarchy}</span>
                </div>
                <p className="control-card__key">
                  <code>{role.key}</code>
                </p>
                <p className="control-card__text">{role.description}</p>
                <div className="control-card__flags">
                  {role.isPrivate ? <Pill tone="soft">Privado</Pill> : <Pill>Público</Pill>}
                  {role.requiresGrant ? <Pill>Exige concessão</Pill> : <Pill>Livre</Pill>}
                  {role.isSystem ? <Pill>Sistema</Pill> : null}
                </div>
                <div className="control-card__benefits">
                  <p className="control-label">Benefícios próprios</p>
                  {role.ownBenefits.length === 0 ? (
                    <p className="control-muted">Nenhum benefício próprio.</p>
                  ) : (
                    <BenefitList items={role.ownBenefits} />
                  )}
                  <p className="control-label">Herdados (não são concessões independentes)</p>
                  {role.inheritedBenefits.length === 0 ? (
                    <p className="control-muted">Nenhum benefício herdado.</p>
                  ) : (
                    <BenefitList items={role.inheritedBenefits} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="beneficios"
        title="Benefícios"
        icon="benefit"
        description="Catálogo independente de benefícios e sua relação com os cargos."
      >
        <div className="control-callout" role="note">
          <p>Benefícios herdados não são duplicados como concessões independentes.</p>
          <p>
            O benefício administrativo existe no catálogo, mas não é concedido por nenhum cargo e
            continua indisponível no ambiente local.
          </p>
        </div>

        <h3 className="control-subtitle">Benefícios próprios do VIP</h3>
        {snapshot.vipBenefits.length === 0 ? (
          <p className="control-muted">Nenhum benefício próprio definido para VIP.</p>
        ) : (
          <BenefitList items={snapshot.vipBenefits} />
        )}

        {snapshot.benefits.length === 0 ? (
          <EmptyState
            title="Nenhum benefício definido"
            text="Não há definições de benefício disponíveis nos contratos carregados."
          />
        ) : (
          <ul className="control-card-grid">
            {snapshot.benefits.map((benefit) => (
              <li className="control-card" key={benefit.key}>
                <div className="control-card__top">
                  <h3>{benefit.name}</h3>
                  <Pill tone="soft">{benefit.typeLabel}</Pill>
                </div>
                <p className="control-card__key">
                  <code>{benefit.key}</code>
                </p>
                <p className="control-card__text">{benefit.description}</p>
                {benefit.isExclusive ? <Pill tone="demo">Exclusivo</Pill> : null}
                <div className="control-card__benefits">
                  <p className="control-label">Concedido diretamente por</p>
                  <RoleList items={benefit.directRoles} />
                  <p className="control-label">Herdado por</p>
                  <RoleList items={benefit.inheritedRoles} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="colecoes"
        title="Coleções"
        icon="collection"
        description="Consulta de coleções e conjuntos. Conclusão e recompensas ainda não implementadas."
      >
        {snapshot.collections.length === 0 ? (
          <EmptyState
            title="Nenhuma coleção cadastrada"
            text="Não há coleções, recompensas ou progresso para exibir nesta etapa."
          />
        ) : (
          <ul className="control-card-grid">
            {snapshot.collections.map((collection) => (
              <li className="control-card" key={collection.key}>
                <div className="control-card__top">
                  <h3>{collection.name}</h3>
                  <Pill tone="soft">{collection.statusLabel}</Pill>
                </div>
                <p className="control-card__key">
                  <code>{collection.key}</code>
                </p>
                <p className="control-card__text">{collection.description}</p>
                <dl className="control-card__meta">
                  <Meta label="Itens definidos" value={String(collection.itemCount)} />
                </dl>
                {collection.isDemo ? <Pill tone="demo">Demonstração</Pill> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
