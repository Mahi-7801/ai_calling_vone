import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, SlidersHorizontal, Sparkles, LayoutPanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiEmployeeBuilderHero } from '@/components/employees/ai-employee-builder-hero';
import { EmployeeWizard } from '@/components/employees/employee-wizard';
import { CartesiaAgentStudio } from '@/components/employees/cartesia-agent-studio';

export function EmployeeNewPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'studio' | 'instant' | 'wizard'>('studio');

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <Button variant="ghost" size="sm" onClick={() => navigate('/employees')} className="self-start text-xs sm:text-sm">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Employees
        </Button>

        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-muted/60 p-1 rounded-xl border border-border/40">
          <Button
            variant={viewMode === 'studio' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('studio')}
            className={`text-xs h-7 px-3 ${viewMode === 'studio' ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm' : ''}`}
          >
            <LayoutPanelLeft className="mr-1.5 h-3.5 w-3.5" />
            AI Agent Studio
          </Button>

          <Button
            variant={viewMode === 'instant' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('instant')}
            className={`text-xs h-7 px-3 ${viewMode === 'instant' ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-sm' : ''}`}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-200" />
            Telugu Instant AI
          </Button>

          <Button
            variant={viewMode === 'wizard' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('wizard')}
            className="text-xs h-7 px-3"
          >
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            Manual Wizard
          </Button>
        </div>
      </div>

      {viewMode === 'studio' ? (
        <CartesiaAgentStudio
          onSaved={(emp) => navigate(`/employees/${emp.id}`)}
          onCancel={() => navigate('/employees')}
        />
      ) : viewMode === 'instant' ? (
        <div className="space-y-6">
          <AiEmployeeBuilderHero />
        </div>
      ) : (
        <div className="space-y-4">
          <EmployeeWizard />
        </div>
      )}
    </div>
  );
}